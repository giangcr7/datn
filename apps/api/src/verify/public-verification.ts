type VerificationResult = {
  success: boolean;
  isValid: boolean;
  verificationStatus: string;
  message: string;
  isRevoked?: boolean;
  fileVerification?: string;
  details?: Record<string, unknown>;
};

export function publicVerification(result: VerificationResult) {
  const response: VerificationResult = {
    success: result.success,
    isValid: result.isValid,
    verificationStatus: result.verificationStatus,
    message: result.isValid
      ? 'Thông tin văn bằng đã được xác thực.'
      : result.message,
  };
  if (typeof result.isRevoked === 'boolean')
    response.isRevoked = result.isRevoked;
  if (!result.isValid) {
    const replacement = result.details?.replacementUuid;
    if (
      result.verificationStatus === 'SUPERSEDED' &&
      typeof replacement === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        replacement,
      )
    )
      response.details = { replacementUuid: replacement };
    return response;
  }
  const details: Record<string, unknown> = {};
  for (const key of [
    'studentName',
    'major',
    'grade',
    'issueDate',
    'degreeType',
    'soVaoSo',
    'soHieu',
    'namTotNghiep',
  ]) {
    const value = result.details?.[key];
    if (typeof value === 'string' && value.length <= 512) details[key] = value;
    else if (
      key === 'namTotNghiep' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    )
      details[key] = value;
  }
  const printed = result.details?.printedDiploma as
    | { issuePlace?: unknown }
    | undefined;
  if (
    typeof printed?.issuePlace === 'string' &&
    printed.issuePlace.length <= 255
  )
    details.printedDiploma = { issuePlace: printed.issuePlace };
  response.details = details;
  if (result.fileVerification === 'EXACT_SIGNED_FILE_MATCH')
    response.fileVerification = result.fileVerification;
  return response;
}
