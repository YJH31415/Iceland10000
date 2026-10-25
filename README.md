# ASHFLOW — Iceland Volcano Ash Simulation

아이슬란드 에이야퍄들라이외퀴들(Eyjafjallajökull) 화산 분출을 참고해 화산재 입자의 대기 이동, 침강, 지표 퇴적 및 유럽 주요 도시의 모델 농도를 탐색하는 연구·교육용 웹 시뮬레이터입니다.

> **중요한 한계:** 현재 ZIP은 실행 가능한 MVP입니다. 기본 바람장은 **합성 시나리오 바람(synthetic)** 이며 2010년 실제 기상 재현이나 항공 운항 안전 판단에 사용할 수 없습니다. 지도상의 입자 경로와 농도는 모델 가정에 따른 시뮬레이션 결과입니다. 실제 재분석 기상장, 3D 수직속도, 검증된 분출률·입도분포를 연결하기 전에는 과학적 재현 모델로 간주하지 마세요.

## 기능

- MapLibre 기반 인터랙티브 지도와 지구본 투영
- 재생 / 일시정지 / 초기화 및 시뮬레이션 속도 선택
- 입자 크기, 배출량, 바람 방향·속도, 난류 확산 조절
- 구형 지구 위 위경도 이동, 입자 크기 기반 단순 침강
- 런던·파리·프랑크푸르트·오슬로·스톡홀름 근사 농도 지표
- 30분 단위 스냅샷 통계, CSV 및 JSON 내보내기
- GitHub Actions 빌드 검증

## 로컬 실행

요구사항: Node.js 20 이상 권장.

```bash
npm install
npm run dev
```

터미널에 표시되는 Vite 로컬 주소를 브라우저에서 여세요.

프로덕션 빌드:

```bash
npm run typecheck
npm run build
npm run preview
```

## GitHub에 올리기

1. ZIP 압축을 풉니다.
2. GitHub에서 빈 저장소를 만듭니다.
3. 압축을 푼 폴더 안에서 실행합니다.

```bash
git init
git add .
git commit -m "Initial ASHFLOW simulation app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

GitHub 저장소의 **Settings → Pages**에서 배포할 경우, Actions 기반 Pages 배포 워크플로를 별도로 설정해야 합니다. 현재 포함된 workflow는 빌드·타입 검사만 수행합니다.

## 모델 구조

- `src/simulation.ts`: 시뮬레이션 상태, 입자 적분, 침강, 농도 근사, 통계 및 내보내기 데이터
- `src/App.tsx`: 컨트롤 패널, 지도, 통계, 도시 경보
- `src/styles.css`: 반응형 대시보드 스타일
- `src/main.tsx`: React 진입점

## 모델 가정과 주의사항

- 입자는 실제 개별 입자를 모두 추적하지 않고 대표 입자(sample particles)로 표현합니다.
- 현재 수직 운동은 단순화되어 있으며 실제 3D 대기 모델이 아닙니다.
- 난류 항은 재현 가능한 의사 난수 기반의 확산 근사입니다.
- 도시 농도는 화면용 근사 지표이지 검증된 지상 PM 농도 예측값이 아닙니다.
- 화면의 농도 구간은 **프로젝트 내부 시각화 구간**입니다. 공식 항공 안전 기준이 아닙니다.
- Open-Meteo Historical Weather API는 지표·일반 기상 변수에 유용하지만 그 자체만으로 완전한 3D 압력면 바람장을 제공하지 않습니다. 2010년 사건 재현에는 ERA5 등 검증된 재분석 자료와 실제 분출 시계열이 필요합니다.

## 다음 단계

1. ERA5 pressure-level 자료의 라이선스·변수·범위 검토 및 전처리
2. 풍향을 직접 보간하지 않고 `u/v` 성분으로 변환 후 공간·시간 보간
3. 지오포텐셜 높이를 이용한 압력면-고도 변환
4. 수직속도 자료 또는 명시적으로 문서화된 대체 모델 연결
5. 입도분포·응집·습식 제거·질량수지 검증
6. 관측 재·항공 영향 자료와 비교해 검증

## 참고 자료

- Open-Meteo Historical Weather API: https://open-meteo.com/en/docs/historical-weather-api
- Open-Meteo Historical Forecast API: https://open-meteo.com/en/docs/historical-forecast-api
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Eyjafjallajökull 2010 ash generation and distribution (Scientific Reports): https://pmc.ncbi.nlm.nih.gov/articles/PMC4948295/

## License

MIT. Basemap tiles are provided by the configured third-party style provider and remain subject to that provider's terms.
