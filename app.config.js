const { expo } = require("./app.json");

const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = {
  ...expo,
  name: isDevelopment ? "Eatlog Dev" : expo.name,
  updates: {
    url: "https://u.expo.dev/700befb6-016e-4d35-a35c-bd375da07e4d",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  android: {
    ...expo.android,
    package: isDevelopment ? "com.sgaret.eatlog.dev" : expo.android.package,
  },
};
