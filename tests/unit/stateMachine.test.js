// Chạy từ thư mục gốc repo:  node --test tests/unit/stateMachine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const sm = require('../../backend/src/modules/state/stateMachine');

test('vehicle: luồng chính AVAILABLE -> RESERVED -> IN_USE -> CHARGING -> AVAILABLE', () => {
  assert.doesNotThrow(() => sm.assertTransition('vehicle', 'AVAILABLE', 'RESERVED'));
  assert.doesNotThrow(() => sm.assertTransition('vehicle', 'RESERVED', 'IN_USE'));
  assert.doesNotThrow(() => sm.assertTransition('vehicle', 'IN_USE', 'CHARGING'));
  assert.doesNotThrow(() => sm.assertTransition('vehicle', 'CHARGING', 'AVAILABLE'));
});

test('vehicle: chuyển sai trả 409 INVALID_STATE_TRANSITION', () => {
  assert.throws(() => sm.assertTransition('vehicle', 'AVAILABLE', 'IN_USE'), { statusCode: 409, code: 'INVALID_STATE_TRANSITION' });
  assert.throws(() => sm.assertTransition('vehicle', 'OUT_OF_SERVICE', 'RESERVED'), { statusCode: 409 });
  assert.throws(() => sm.assertTransition('vehicle', 'CHARGING', 'RESERVED'), { statusCode: 409 });
});

test('trạng thái trùng hoặc không tồn tại', () => {
  assert.throws(() => sm.assertTransition('vehicle', 'AVAILABLE', 'AVAILABLE'), { statusCode: 409 });
  assert.throws(() => sm.assertTransition('vehicle', 'AVAILABLE', 'FLYING'), { statusCode: 400, code: 'INVALID_STATUS' });
});

test('mọi entity: state nào cũng sang được OUT_OF_SERVICE (trừ chính nó) và OUT_OF_SERVICE chỉ về trạng thái rảnh', () => {
  for (const [entity, free] of [['vehicle', 'AVAILABLE'], ['chargingPoint', 'AVAILABLE'], ['parkingSlot', 'FREE']]) {
    for (const s of sm.statusesOf(entity)) {
      if (s !== 'OUT_OF_SERVICE') assert.ok(sm.canTransition(entity, s, 'OUT_OF_SERVICE'), `${entity} ${s} -> OUT_OF_SERVICE`);
    }
    assert.deepEqual(sm.allowedNext(entity, 'OUT_OF_SERVICE'), [free]);
  }
});

test('hub: chỉ ACTIVE <-> MAINTENANCE bằng tay', () => {
  assert.ok(sm.canTransition('hub', 'ACTIVE', 'MAINTENANCE'));
  assert.ok(sm.canTransition('hub', 'MAINTENANCE', 'ACTIVE'));
  assert.ok(!sm.canTransition('hub', 'ACTIVE', 'FULL'));
  assert.ok(!sm.canTransition('hub', 'NEAR_FULL', 'ACTIVE'));
});

test('mọi state đích trong bảng đều là state có thật', () => {
  for (const entity of Object.keys(sm.TRANSITIONS)) {
    const known = new Set(sm.statusesOf(entity));
    for (const targets of Object.values(sm.TRANSITIONS[entity])) {
      for (const t of targets) assert.ok(known.has(t), `${entity}: ${t} không có trong danh sách state`);
    }
  }
});
