# Android App Wrapper

이 디렉터리는 `WORD & LIFE` 웹서비스를 안드로이드 앱으로 감싸는 WebView 앱 프로젝트입니다.

## 목적

- 설치 진입을 브라우저보다 단순하게 만듭니다.
- 내부 테스트는 `APK` 직접 배포로 진행할 수 있습니다.
- 안정화 후 `비공개 Play 배포`로 전환할 수 있는 표준 구조입니다.

## 현재 설정

- 앱 이름: `WORD & LIFE`
- 패키지명: `com.ghchurch.wordlife`
- 시작 URL: `https://ghchurch.vercel.app/cell`

`app/build.gradle`의 `buildConfigField("String", "WEB_APP_URL", ...)` 값만 바꾸면 실제 운영 주소로 교체할 수 있습니다.

## 빌드

Android Studio에서 `android-app/` 디렉터리를 열고 실행합니다.

## 배포 방식

1. 내부 테스트
`Build > Build APK(s)`로 생성된 APK를 직접 배포

2. 비공개 Play 배포
`Build > Generate Signed Bundle / APK`로 AAB 생성 후 Play Console의 내부 테스트 또는 비공개 테스트에 업로드
