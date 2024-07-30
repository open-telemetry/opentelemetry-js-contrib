module.exports = api => {
  api.cache(false);

  return {
    presets: ['module:metro-react-native-babel-preset', '@babel/preset-env'],
    plugins: ['babel-plugin-react-native-web'],
  };
};
