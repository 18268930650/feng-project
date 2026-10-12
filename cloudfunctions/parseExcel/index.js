const cloud = require('wx-server-sdk');
const xlsx = require('node-xlsx');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 辅助函数：将单元格可能包含的 Object、Date、RichText 等提取为纯文本/基础数据类型
function extractCleanValue(cell) {
  if (cell === undefined || cell === null) {
    return '';
  }
  // 如果是 Date 对象
  if (cell instanceof Date) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
  }
  // 如果是对象 (node-xlsx / xlsx 可能返回 { v: '...', w: '...', t: 's' } 或富文本格式)
  if (typeof cell === 'object') {
    if (cell.w !== undefined && cell.w !== null) {
      return String(cell.w).trim();
    }
    if (cell.v !== undefined && cell.v !== null) {
      return String(cell.v).trim();
    }
    if (cell.text !== undefined && cell.text !== null) {
      return String(cell.text).trim();
    }
    // 提取对象中的第一个基本类型属性值
    for (const k of Object.keys(cell)) {
      if (typeof cell[k] === 'string' || typeof cell[k] === 'number') {
        return String(cell[k]).trim();
      }
    }
    return '';
  }
  return String(cell).trim();
}

// 辅助函数：从云数据库分批获取所有 Excel 数据（突破单次 100 条限制，最多获取 1000 条）
async function getAllExcelRecords(maxLimit = 1000) {
  try {
    const countResult = await db.collection('excel_data').count();
    const total = countResult.total || 0;
    if (total === 0) {
      return { list: [], total: 0, headers: [] };
    }

    const BATCH_SIZE = 100; // 云函数端单次最大获取 100 条
    const fetchCount = Math.min(total, maxLimit);
    const batchTimes = Math.ceil(fetchCount / BATCH_SIZE);
    const tasks = [];

    for (let i = 0; i < batchTimes; i++) {
      tasks.push(
        db.collection('excel_data')
          .orderBy('_timestamp', 'desc')
          .skip(i * BATCH_SIZE)
          .limit(BATCH_SIZE)
          .get()
      );
    }

    const resList = await Promise.all(tasks);
    const allRecords = resList.reduce((acc, cur) => acc.concat(cur.data || []), []);
    
    // 提取有序表头
    let headers = [];
    if (allRecords.length > 0 && allRecords[0]._headers && Array.isArray(allRecords[0]._headers)) {
      headers = allRecords[0]._headers;
    }

    return {
      list: allRecords,
      total: total,
      headers: headers
    };
  } catch (err) {
    console.error('[getAllExcelRecords 异常]:', err);
    throw err;
  }
}

exports.main = async (event, context) => {
  const { action, fileID, fileName, keyword, maxLimit } = event;

  // ==========================================
  // 分支 1：查询数据接口 (action === 'query' 或 传入 keyword)
  // ==========================================
  if (action === 'query' || (!fileID && keyword !== undefined)) {
    try {
        const kw = (keyword || '').trim();
        
        // 情况 A：用户输入了关键词 -> 直接在数据库中全库检索（突破 1000 条限制）
        if (kw) {
          const _ = db.command;
          const reg = db.RegExp({
            regexp: kw,
            options: 'i' // 不区分大小写
          });
          
          // 先查一条获取表头字段，找出可能代表商品编号的列
          const sample = await db.collection('excel_data').limit(1).get();
          const headers = (sample.data[0] && sample.data[0]._headers) || [];
          
          // 构造针对常见商品编号、编码等列的 OR 正则查询
          const orConditions = [];
          headers.forEach(h => {
            const lowerH = h.toLowerCase();
            if (lowerH.includes('编号') || lowerH.includes('编码') || 
                lowerH.includes('货号') || lowerH.includes('条码') || 
                lowerH.includes('code') || lowerH.includes('sku') || 
                lowerH.includes('商品') || lowerH.includes('物料')) {
              orConditions.push({ [h]: reg });
            }
          });
          
          // 如果没有匹配到特定列名，对所有非下划线列进行匹配
          if (orConditions.length === 0) {
            headers.forEach(h => {
              if (!h.startsWith('_')) orConditions.push({ [h]: reg });
            });
          }
          // 在云数据库中全库匹配（单次最多 100 条，满足匹配项展示）
          const queryRes = await db.collection('excel_data')
            .where(_.or(orConditions))
            .orderBy('_timestamp', 'desc')
            .limit(100)
            .get();
          return {
            success: true,
            list: queryRes.data,
            headers: headers,
            total: queryRes.data.length,
            message: `查询成功，找到 ${queryRes.data.length} 条记录`
          };
        }
        // 情况 B：无关键词时 -> 返回最新的 500 ~ 1000 条作为默认展示
        const queryResult = await getAllExcelRecords(maxLimit || 1000);
        return {
          success: true,
          list: queryResult.list,
          headers: queryResult.headers,
          total: queryResult.total,
          message: '加载成功'
        };
    } catch (queryErr) {
      console.error('[云函数 parseExcel] 查询失败:', queryErr);
      return {
        success: false,
        message: queryErr.message || '查询失败',
        error: queryErr
      };
    }
  }

  // ==========================================
  // 分支 2：Excel 文件解析入库
  // ==========================================
  if (!fileID) {
    return {
      success: false,
      message: '缺少 fileID 或 action 参数'
    };
  }

  try {
    console.log('[云函数 parseExcel] 开始下载文件:', fileID);

    // 1. 从云存储下载 Excel 二进制文件
    const fileRes = await cloud.downloadFile({
      fileID: fileID
    });
    const buffer = fileRes.fileContent;

    // 2. 解析 Excel 二进制 Buffer
    const sheets = xlsx.parse(buffer, { raw: false });
    if (!sheets || sheets.length === 0) {
      return {
        success: false,
        message: 'Excel 文件内容为空'
      };
    }

    const firstSheet = sheets[0];
    const sheetName = firstSheet.name || 'Sheet1';
    const rawRows = firstSheet.data;

    if (!rawRows || rawRows.length === 0) {
      return {
        success: false,
        message: '未在工作表中找到数据'
      };
    }

    // 3. 严格按 Excel 原始顺序提取并清洗第一行表头
    const headerRow = rawRows[0] || [];
    const headers = [];
    headerRow.forEach((h, i) => {
      const cleanHeader = extractCleanValue(h);
      const headerTitle = cleanHeader ? cleanHeader : `第${i + 1}列`;
      headers.push(headerTitle);
    });

    if (headers.length === 0) {
      return {
        success: false,
        message: '未提取到有效表头'
      };
    }

    console.log('[云函数 parseExcel] 清洗后的表头:', headers);

    const records = [];
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 4. 遍历数据行（从第 2 行开始），清洗每个单元格为字符串
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      let hasValidCell = false;
      const rowObj = {
        _sourceFileName: fileName || '未命名文件.xlsx',
        _fileID: fileID,
        _sheetName: sheetName,
        _rowIndex: i,
        _headers: headers, // 原始表头顺序
        _importTime: timeStr,
        _timestamp: Date.now()
      };

      headers.forEach((headerKey, colIdx) => {
        const rawCell = row[colIdx];
        const cleanVal = extractCleanValue(rawCell);
        if (cleanVal !== '') {
          hasValidCell = true;
        }
        rowObj[headerKey] = cleanVal;
      });

      if (hasValidCell) {
        records.push(rowObj);
      }
    }

    console.log(`[云函数 parseExcel] 解析完成，有效清洗记录数: ${records.length}`);

    // 5. 写入云数据库集合 excel_data
    let insertCount = 0;
    for (const record of records) {
      await db.collection('excel_data').add({
        data: record
      });
      insertCount++;
    }

    return {
      success: true,
      sheetName: sheetName,
      headers: headers,
      totalCount: insertCount,
      previewData: records.slice(0, 5),
      message: `成功解析并导入 ${insertCount} 条记录`
    };

  } catch (error) {
    console.error('[云函数 parseExcel] 处理失败:', error);
    return {
      success: false,
      message: error.message || 'Excel 解析失败',
      error: error
    };
  }
};
