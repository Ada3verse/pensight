// 세특 생성 모드의 처리 단계. 세특 흐름(SespecGenPage/SespecPage)에는 개인정보 마스킹 단계가 없어
// 실제로 수행하지 않는 단계를 보여주지 않도록 마스킹 단계는 넣지 않았다.
export const SESPEC_STEPS = ['파일 업로드', '텍스트 추출 중', '세특 초안 생성 중', '완료']

export const OCR_HINT = '보통 10~30초'
export const SESPEC_HINT = '학생 수에 따라 1~3분'
