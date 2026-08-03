const { expo } = require("./app.json");

const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = {
	...expo,
	name: isDevelopment ? "Eatlog Dev" : expo.name,
	updates: {
		url: "https://u.expo.dev/bffe0ee2-d580-4ad2-8fa1-ae76f16279c3",
	},
	runtimeVersion: {
		policy: "appVersion",
	},
	android: {
		...expo.android,
		package: isDevelopment ? "com.marco.tracker.dev" : expo.android.package,
	},
};
