const appVariant = process.env.APP_VARIANT;
const isDevelopment = appVariant === "development";
const isPreview = appVariant === "preview";

const appName = isPreview ? "Eatlog Preview" : "Eatlog";
const appIdentifier = isDevelopment
  ? "com.sgaret.eatlog.dev"
  : isPreview
    ? "com.sgaret.eatlog.preview"
    : "com.sgaret.eatlog";

module.exports = ({ config }) => ({
  ...config,
  name: appName,
  plugins: [
    ...(config.plugins ?? []),
    ...(isPreview ? ["./plugins/withEatlogSubscriptionPreview"] : []),
  ],
  updates: {
    url: "https://u.expo.dev/700befb6-016e-4d35-a35c-bd375da07e4d",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  android: {
    ...config.android,
    package: appIdentifier,
  },
  ios: {
    ...config.ios,
    bundleIdentifier: appIdentifier,
  },
});
