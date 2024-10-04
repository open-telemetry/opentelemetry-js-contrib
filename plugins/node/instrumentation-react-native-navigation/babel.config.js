module.exports = api => {
  api.cache(false);

  return {
    presets: ['module:metro-react-native-babel-preset'],
    plugins: ['babel-plugin-react-native-web'],
  };
};
