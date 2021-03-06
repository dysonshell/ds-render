'use strict';
var tape = require('tape');
var app = require('./example')();
var request = require('supertest');

app.get('/cccc', function (req, res, next) {
    res.viewPath = '/ccc';
    next();
});

app.use(app.dsRenderMiddleware);

tape('when global view and components view name conflicts, ' +
    'solve to global view.',
    function (test) {
        test.plan(2);
        request(app)
            .get('/ccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial a');
            });
    });

tape('also support res.viewPath, treat exactly like req.path',
    function (test) {
        test.plan(2);
        request(app)
            .get('/cccc')
            .expect(200)
            .end(function (err, res) {
                test.notOk(err);
                test.equal(res.text.trim(), 'partial a');
            });
    });
