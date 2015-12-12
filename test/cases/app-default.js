'use strict';
var path = require('path');
process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '..', 'example', 'config');
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

app.locals.dsViewPath = 'ccc/global/views/a';

require('../../')(app);

tape('root', function (test) {
    test.plan(2);
    request(app)
        .get('/')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            console.log(res.text);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('default', function (test) {
    test.plan(2);
    request(app)
        .get('/default')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            console.log(res.text);
            test.equal(res.text.trim(), 'partial a');
        });
});

tape('whatever', function (test) {
    test.plan(2);
    request(app)
        .get('/what/ever')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            console.log(res.text);
            test.equal(res.text.trim(), 'partial a');
        });
});
