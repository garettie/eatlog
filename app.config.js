const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => ({
  ...config,
  updates: {
    url: "https://u.expo.dev/700befb6-016e-4d35-a35c-bd375da07e4d",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  android: {
    ...config.android,
    package: isDevelopment ? "com.sgaret.eatlog.dev" : config.android.package,
  },
  ios: {
    ...config.ios,
    bundleIdentifier: isDevelopment ? "com.sgaret.eatlog.dev" : config.ios.bundleIdentifier,
  },
});
