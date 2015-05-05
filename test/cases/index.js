'use strict';
var tape = require('tape');
var app = require('../example');
var request = require('supertest');

require('../../')(app);

tape('index', function (test) {
    test.plan(2);
    request(app)
        .get('/c')
        .expect(200)
        .end(function (err, res) {
            test.notOk(err);
            test.equal(res.text.trim(), 'partial in testc');
        });
});
