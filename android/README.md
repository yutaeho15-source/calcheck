# CalCheck Android (TWA)

Android Studio에서 이 `android/` 폴더를 열고 **Build → Build Bundle(s) / APK(s) → Build APK(s)** 를 누르면
`app/build/outputs/apk/release/app-release.apk` 가 나온다. (Build Variants에서 release를 고르거나, debug로 빌드해도 같은 키로 서명되어 동작한다.)

- 앱 본체는 https://yutaeho15-source.github.io/calcheck/ 이고, 이 APK는 그걸 크롬 엔진으로 전체 화면에 띄우는 껍데기다.
- `calcheck-release.jks` + `keystore-password.txt` 는 서명 키. **git에 올라가지 않으며, 잃어버리면 같은 패키지로 업데이트 설치가 안 된다.** 백업해 둘 것.
- 사이트의 `/.well-known/assetlinks.json` 에 이 키의 SHA-256 지문이 올라가 있어서, 설치하면 주소창 없이 뜬다.
  (처음 실행 직후 1회는 크롬이 검증을 끝낼 때까지 잠깐 바가 보일 수 있다.)
- 폰에 크롬이 있어야 한다 (TWA는 크롬 엔진을 쓴다).
