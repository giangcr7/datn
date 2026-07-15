// 1. Mã trạng thái HTTP chuẩn hóa
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE: 422,
  INTERNAL_SERVER: 500
} as const;

export type HttpStatus = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];

export const HTTP_MESSAGES: Record<HttpStatus, string> = {
  [HTTP_STATUS.OK]: "Thao tác thành công",
  [HTTP_STATUS.CREATED]: "Khởi tạo thành công",
  [HTTP_STATUS.BAD_REQUEST]: "Yêu cầu không hợp lệ",
  [HTTP_STATUS.UNAUTHORIZED]: "Phiên đăng nhập hết hạn hoặc chưa đăng nhập",
  [HTTP_STATUS.FORBIDDEN]: "Bạn không có quyền thực hiện tác vụ này",
  [HTTP_STATUS.NOT_FOUND]: "Không tìm thấy dữ liệu yêu cầu",
  [HTTP_STATUS.UNPROCESSABLE]: "Dữ liệu đầu vào không hợp lệ",
  [HTTP_STATUS.INTERNAL_SERVER]: "Hệ thống đang bảo trì, vui lòng thử lại sau"
} as const;

// 2. Vai trò người dùng (Khớp với UserSchema của bạn)
export const USER_ROLES = {
  UNIVERSITY: 'university',
  STUDENT: 'student',
  EMPLOYER: 'employer',
  ADMIN: 'admin'
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// 3. Trạng thái vòng đời của văn bằng (Hybrid Blockchain flow)
export const DIPLOMA_STATUS = {
  // Giai đoạn 1: Dữ liệu mới nhập từ Excel (Chỉ có ở MongoDB)
  IMPORTED: 'IMPORTED',     
  
  // Giai đoạn 2: Đã được University xác nhận thông tin (Chưa ký số)
  VALIDATED: 'VALIDATED',   
  
  // Giai đoạn 3: Đã ký số và đẩy lên Hyperledger Fabric thành công
  ON_CHAIN: 'ON_CHAIN',     
  
  // Giai đoạn 4: Văn bằng bị thu hồi do vi phạm/sai sót (Cập nhật trên Fabric)
  REVOKED: 'REVOKED'        
} as const;

export type DiplomaStatus = typeof DIPLOMA_STATUS[keyof typeof DIPLOMA_STATUS];

// 4. Xếp loại học lực chuẩn Bộ GD&ĐT
export const ACADEMIC_RANK = {
  EXCELLENT: 'Xuất sắc',
  VERY_GOOD: 'Giỏi',
  GOOD: 'Khá',
  AVERAGE: 'Trung bình'
} as const;

export type AcademicRank = typeof ACADEMIC_RANK[keyof typeof ACADEMIC_RANK];

// 5. Hệ đào tạo / Loại văn bằng
export const DIPLOMA_TYPES = {
  ENGINEER: 'Kỹ sư',
  BACHELOR: 'Cử nhân',
  MASTER: 'Thạc sĩ'
} as const;

export type DiplomaType = typeof DIPLOMA_TYPES[keyof typeof DIPLOMA_TYPES];