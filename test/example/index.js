'use strict';
module.exports = function () {
    var app = require('@ds/base')
        .createApp(__dirname);

    app.dsRenderMiddleware = require('../../')
        .augmentApp(app, {
            appendMiddleware: false,
            appRoot: __dirname,
            assetsDirName: 'assets',
            viewsDirName: 'views'
        });

    return app;
};
