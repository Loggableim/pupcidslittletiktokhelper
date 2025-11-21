window.addEventListener('beforeunload', () => window.close());

document.cookie = 'cookie-consent={%22ga%22:true%2C%22af%22:true%2C%22fbp%22:true%2C%22lip%22:true%2C%22bing%22:true%2C%22ttads%22:true%2C%22reddit%22:true%2C%22criteo%22:true%2C%22version%22:%22v9%22};domain=.tiktok.com;path=/;max-age=9999999999';

setInterval(() => {
    if (!location.href.includes('login') && !location.href.includes('logout') && !location.href.includes('signup')) {
        window.close();
    }
}, 100)