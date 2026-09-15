// ES modules don't load from file:// — explain instead of hanging on "불러오는 중…".
if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('app').innerHTML =
      '<div class="fatal">' +
      '<h1>파일을 직접 열면 앱이 실행되지 않습니다</h1>' +
      '<p>터미널에서 프로젝트 폴더로 이동한 뒤 <b>npm run dev</b> 를 실행하고,<br>' +
      '브라우저에서 <b>http://localhost:8000</b> 을 열어 주세요.</p>' +
      '</div>';
  });
}
