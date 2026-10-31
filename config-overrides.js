const webpack = require('webpack');

module.exports = function override(config) {
    const fallback = config.resolve.fallback || {};
    Object.assign(fallback, {
        "zlib": require.resolve("browserify-zlib"),
        "querystring": require.resolve("querystring-es3"),
        "path": require.resolve("path-browserify"),
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "http": require.resolve("stream-http"),
        "url": require.resolve("url/"),
        "buffer": require.resolve("buffer/"),
        "util": require.resolve("util/"),
        "assert": require.resolve("assert/"),
        "vm": require.resolve("vm-browserify"),
        "fs": false,
        "net": false,
        "process": require.resolve("process/browser")
    });
    config.resolve.fallback = fallback;

    // 添加别名配置
    config.resolve.alias = {
        ...config.resolve.alias,
        'process/browser': require.resolve('process/browser')
    };

    // 为 process 和 Buffer 提供全局变量
    config.plugins = (config.plugins || []).concat([
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ]);

    return config;
};