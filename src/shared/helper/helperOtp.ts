import { randomInt } from 'crypto'

export const generateOTP = () => {
  return randomInt(100000, 1000000).toString() // Hàm này sẽ tạo ra một mã OTP ngẫu nhiên gồm 6 chữ số, sử dụng hàm randomInt từ module crypto của Node.js để sinh ra một số nguyên ngẫu nhiên trong khoảng từ 100000 đến 999999, sau đó chuyển đổi số đó thành chuỗi và trả về kết quả. Mã OTP này có thể được sử dụng cho các mục đích xác thực hoặc bảo mật trong ứng dụng của bạn.
}
