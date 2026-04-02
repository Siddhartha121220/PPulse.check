module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
      },
    ],
    ['react-native-worklets-core/plugin'],
    'react-native-reanimated/plugin',
  ],
};
