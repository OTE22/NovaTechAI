const toggle=document.querySelector('.menu-toggle');
const nav=document.querySelector('#site-nav');
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')==='true';toggle.setAttribute('aria-expanded',String(!open));toggle.setAttribute('aria-label',open?'Open menu':'Close menu');nav.classList.toggle('open',!open)});
nav.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open menu')}));
document.querySelector('#year').textContent=new Date().getFullYear();
const revealTargets=document.querySelectorAll('.service-card,.microsoft-products article,.case-card,.process-track li,.outcome-list>div,.training-grid>div,.research-grid>div');
revealTargets.forEach(el=>el.classList.add('reveal'));
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});revealTargets.forEach(el=>observer.observe(el))}else{revealTargets.forEach(el=>el.classList.add('visible'))}
