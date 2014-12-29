'use strict';
module.exports = function () {
    var app = require('@ds/base')
        .createApp(__dirname);

    require('../../')
        .argmentApp(app, {
            appendMiddleware: false,
            appRoot: __dirname,
            assetsDirName: 'assets',
            viewsDirName: 'views'
        });

    return app;
};