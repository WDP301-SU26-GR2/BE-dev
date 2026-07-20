// Ép múi giờ về UTC cho MỌI unit test.
//
// ⚠ File này BẮT BUỘC nằm ngoài `src/`: `tsconfig.build.json` include `src` nên nếu để trong đó
// nó bị compile vào `dist/` — code chết nhưng vẫn là rác trong artifact production, trái kỷ luật
// đang giữ (build đã exclude `test`, `scripts`, `*spec.ts`).
//
// Chạy TRƯỚC khi jest spawn worker, nên worker
// kế thừa TZ ngay lúc khởi động process (đặt `process.env.TZ` trong `setupFiles` là QUÁ MUỘN:
// Node/ICU đã cache timezone mặc định rồi — đã thử và không ăn).
//
// Vì sao cần: máy dev của team ở UTC+7 (`Asia/Bangkok`/`Asia/Ho_Chi_Minh`) trùng đúng múi giờ
// nghiệp vụ, nên test ngày giờ "xanh giả": code quên `timeZone: 'Asia/Ho_Chi_Minh'` vẫn ra kết quả
// đúng nhờ giờ máy và chỉ vỡ khi deploy lên VPS chạy UTC. Đã tái hiện thật: bỏ `timeZone` khỏi
// `contract-pdf.document.tsx` mà toàn bộ test vẫn xanh trên máy này.
//
// Chạy test ở UTC khớp môi trường production (BE lưu + trả ISO UTC; chỉ chỗ render PDF mới đổi
// sang giờ VN) và làm lộ ngay lớp bug quên timeZone.
export default function globalSetup() {
  process.env.TZ = 'UTC'
}
