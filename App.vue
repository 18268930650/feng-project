<script>
	export default {
		onLaunch: function() {
			console.log('App Launch');
			// #ifdef MP-WEIXIN
			if (wx.cloud) {
				wx.cloud.init({
					env: 'cloud1-d1gqnxb9p710b6580',
					traceUser: true
				});
				console.log('微信云开发环境初始化完成: cloud1-d1gqnxb9p710b6580');
			} else {
				console.error('请使用 2.2.3 或以上的基础库以使用微信云能力');
			}
			// #endif
		},
		onShow: function() {
			console.log('App Show');
		},
		onHide: function() {
			console.log('App Hide');
		}
	}
</script>

<style>
	/*每个页面公共css */
</style>
