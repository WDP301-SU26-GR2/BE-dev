export const MagazineMessages = {
  response: {
    magazineCreated: 'Đã thêm tạp chí vào danh mục',
    magazineUpdated: 'Đã cập nhật nhịp phát hành của tạp chí',
    magazineDeleted: 'Đã xoá tạp chí khỏi danh mục'
  },
  error: {
    magazineAlreadyExists: 'Error.MagazineAlreadyExists',
    magazineNotFound: 'Error.MagazineNotFound',
    magazineInUse: 'Error.MagazineInUse',
    publicationTypeInUse: 'Error.PublicationTypeInUse',
    magazineNotRegistered: 'Error.MagazineNotRegistered',
    publicationTypeNotSupportedByMagazine: 'Error.PublicationTypeNotSupportedByMagazine'
  },
  errorText: {
    'Error.MagazineAlreadyExists': 'Tạp chí này đã có trong danh mục',
    'Error.MagazineNotFound': 'Không tìm thấy tạp chí trong danh mục',
    'Error.MagazineInUse': 'Không thể xoá tạp chí đang có bộ truyện hoặc kỳ bình chọn sử dụng',
    'Error.PublicationTypeInUse': 'Không thể bỏ nhịp phát hành đang có bộ truyện hoặc kỳ bình chọn sử dụng',
    'Error.MagazineNotRegistered': 'Tạp chí không nằm trong danh mục tạp chí của nhà xuất bản',
    'Error.PublicationTypeNotSupportedByMagazine': 'Tạp chí này không phát hành theo nhịp đã chọn'
  }
} as const
