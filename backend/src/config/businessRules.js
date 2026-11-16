/**
 * Các hằng số nghiệp vụ dùng chung (đối chiếu với tài liệu 1.5 Business Rules).
 * Sửa tại đây nếu nhóm chốt con số khác.
 */
module.exports = {
  // Pin tối thiểu (%) để một xe được đặt trước / hiển thị là "available".
  MIN_BATTERY_TO_RESERVE: 20,
  // Tỉ lệ slot đã dùng (RESERVED + OCCUPIED) / slot khả dụng từ mức này trở lên => Hub NEAR_FULL.
  HUB_NEAR_FULL_RATIO: 0.8,
};
