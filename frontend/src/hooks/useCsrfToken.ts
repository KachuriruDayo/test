// import { useEffect, useState } from 'react';

// export default function useCsrfToken() {
//   const [csrfToken, setCsrfToken] = useState('');

//   useEffect(() => {
//     fetch('http://localhost:3000/api/csrf-token', { credentials: 'include' })
//       .then(res => res.json())
//       .then(data => setCsrfToken(data.csrfToken))
//       .catch(() => setCsrfToken(''));
//   }, []);

//   return csrfToken;
// }

// export default function useCsrfToken() {
//   function getCookie(name: string): string {
//     const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
//     return match ? match[2] : '';
//   }
//   return getCookie('XSRF-TOKEN');
// }


export default function getCsrfToken() {
  // Пытаемся получить из куков
  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith('XSRF-TOKEN='))
    ?.split('=')[1];
  
  return cookieValue || '';
}