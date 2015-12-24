'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
require('ds-require')
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.use(require('ccc/global/routers/page'));
app.get('/err', function (req, res, next) {
    next(new Error('TEST_ERR_TMPL'));
});
require('../../')(app);

tape('partial/a', function (test) {
    test.plan(2);
    request(app)
        .get('/a')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('partial/b', function (test) {
    test.plan(2);
    request(app)
        .get('/b')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('partial/c', function (test) {
    test.plan(2);
    request(app)
        .get('/c')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('not found', function (test) {
    test.plan(2);
    request(app)
        .get('/cc')
        .expect(404)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'hello 404');
        });
});

tape('err page', function (test) {
    test.plan(2);
    request(app)
        .get('/err')
        .expect(500)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'error 500');
        });
});
