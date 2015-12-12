'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.use('/testc', require('../example/ccc/testc/routers/page'));
require('../../')(app);

tape('cc index', function (test) {
    test.plan(2);
    request(app)
        .get('/testc/cc')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            console.log(res.text);
            test.equal(res.text.trim(), 'partial in testc');
        });
});

tape('c index', function (test) {
    test.plan(2);
    request(app)
        .get('/testc/d')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            console.log(res.text);
            test.equal(res.text.trim(), 'partial in testc');
        });
});
