const { pool } = require('../config/db');

/**
 * Chạy `work(conn)` trong một transaction. Tự commit nếu thành công, rollback nếu lỗi.
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Nếu đã có connection (đang nằm trong transaction của module khác) thì dùng lại,
 * ngược lại mở transaction mới.
 */
function runInTransaction(existingConn, work) {
  return existingConn ? work(existingConn) : withTransaction(work);
}

module.exports = { withTransaction, runInTransaction };
