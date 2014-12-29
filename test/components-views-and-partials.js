'use strict';
var tape = require('tape');
var app = require('./example')();
var request = require('supertest');

var path = require('path');
var subApp = require('@ds/base').createSubApp(path.join(__dirname, 'example', 'ccc', 'testc'));

subApp.get('/ccc', function (req, res) {
    res.render();
});

subApp.get('/cccc', function (req, res) {
    res.render('ccc');
});

app.use(subApp);

app.use(require('../')
    .middleware());

tape('when res.render() from sub-apps, solve components views first, ' +
    'and including components partials.',
    function (test) {
        test.plan(2);
        request(app)
            .get('/ccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial in testc');
            });
    });

tape('res.render(otherViewPath) in sub-apps',
    function (test) {
        test.plan(2);
        request(app)
            .get('/cccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial in testc');
            });
    });

tape('for auto solved viewPath, also include components partials',
    function (test) {
        test.plan(2);
        request(app)
            .get('/ccccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial in testc');
            });
    });