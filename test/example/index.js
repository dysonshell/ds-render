'use strict';
var path = require('path');
require('ractive').DEBUG = false;
var app = exports = module.exports = require('express')();
app.set('root', __dirname);

if (require.main === module) {
    app.use('/err', function (req, res, next) {
        next(new Error('TEST_500_PAGE'));
    });
    require('../../').augmentApp(app, {
        appRoot: path.resolve(__dirname)
    });
    app.listen(8000, function (err) {
        if (err) return console.log(err);
        console.log('listening', this.address().port);
    });
}
