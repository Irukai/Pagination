// ==UserScript==
// @name         Discourse 무한 스크롤 페이지네이션 변환 (/c/ 목록 전용, 안전 강화판)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  초기 자동 로드 1페이지만, 아이템 증감 없으면 즉시 중단, 사용자 페이지네이션 유도 포함 안정판
// @author       You
// @match        https://discuss.eroscripts.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 환경 설정
    const itemsPerPage = 15;
    const maxPages = 10;
    const checkInterval = 1000;
    const safeMode = true;
    const maxLoadAttempts = 10;    // 최대 시도 횟수
    const loadWaitTime = 1000;     // 대기시간(ms)
    const autoLoadPages = 1;       // 초기 자동 로드 최대 페이지 수 1로 제한

    let currentPage = 1;
    let contentContainer = null;
    let allItems = [];
    let paginationContainer = null;
    let isInitialized = false;
    let lastItemCount = 0;
    let observer = null;
    let lastUrl = location.href;
    let isLoading = false;

    // 페이지네이션 업데이트 중복방지 플래그
    let isUpdatingPagination = false;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startScriptSafely);
    } else {
        startScriptSafely();
    }

    function startScriptSafely() {
        console.log("Discourse 페이지네이션: 시작 준비 중...");

        checkPageAndInitialize();
        setInterval(checkPageAndInitialize, checkInterval);

        function onUrlChange() {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log("URL 변경 감지됨, 초기화 상태 리셋 및 재초기화 시작");
                isInitialized = false;
                checkPageAndInitialize();
            }
        }

        window.addEventListener('popstate', onUrlChange);

        const originalPushState = history.pushState;
        history.pushState = function() {
            originalPushState.apply(this, arguments);
            setTimeout(onUrlChange, 500);
        };
    }

    function checkPageAndInitialize() {
        if (!location.pathname.startsWith('/c/')) {
            if (isInitialized) {
                removePaginationInterface();
                isInitialized = false;
            }
            return;
        }

        if ((document.body) && !isInitialized) {
            try {
                console.log("페이지네이션 초기화 시작 (/c/ 경로)");
                initialize();
            } catch (error) {
                console.error("페이지네이션 초기화 오류:", error);
            }
        } else if (isInitialized) {
            updateIfNewItemsAdded();
        }
    }

    function removePaginationInterface() {
        if (paginationContainer) {
            paginationContainer.remove();
            paginationContainer = null;
            console.log("페이지네이션 인터페이스 제거됨 (/c/ 외 경로)");
        }
    }

    function updateIfNewItemsAdded() {
        if (!contentContainer) return;
        const currentItems = getDiscourseItems();
        if (currentItems.length > lastItemCount) {
            console.log(`새 아이템 감지: ${lastItemCount} → ${currentItems.length}`);
            collectAllItems();
            updatePaginationInterface();
            showPage(currentPage);
        }
    }

    async function loadAllInfiniteScrollItems() {
        if (isLoading || !contentContainer) return;
        isLoading = true;

        try {

            let prevCount = 0;
            let curCount = getDiscourseItems().length;
            let attempts = 0;
            const targetCount = autoLoadPages * itemsPerPage;

            while (curCount > prevCount && attempts < maxLoadAttempts && curCount < targetCount) {
                prevCount = curCount;

                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(resolve => setTimeout(resolve, loadWaitTime));

                curCount = getDiscourseItems().length;

                attempts++;
                console.log(`무한 스크롤 로딩 시도 ${attempts}, 현재 아이템 수: ${curCount}`);

                // 아이템 수 증가 없으면 조기 종료
                if (curCount === prevCount) {
                    console.log("더 이상 아이템 증가 없음, 자동 로드 중단");
                    break;
                }
            }

            window.scrollTo(0, 0);
            console.log(`무한 스크롤 로딩 완료: 총 ${curCount}개 아이템 로드됨`);
        } finally {
            isLoading = false;
        }
    }

    async function initialize() {
        if (isInitialized) return;
        console.log("Discourse 페이지네이션: 초기화 중...");
        try {
            contentContainer = findDiscourseContentContainer();
            if (!contentContainer) {
                console.log("콘텐츠 컨테이너를 아직 찾을 수 없습니다. 나중에 다시 시도합니다.");
                return;
            }
            console.log("콘텐츠 컨테이너 찾음:", contentContainer);

            await loadAllInfiniteScrollItems();

            if (!safeMode) {
                disableInfiniteScrollSafely();
            }

            collectAllItems();

            if (allItems.length > 0) {
                createPaginationInterface();
                checkUrlForPageNumber();
                isInitialized = true;
                console.log("페이지네이션 초기화 완료!");
                setupContentObserver();
            } else {
                console.warn("표시할 아이템을 찾을 수 없습니다.");
            }
        } catch (error) {
            console.error("초기화 중 오류 발생:", error);
        }
    }

    function disableInfiniteScrollSafely() {
        if (window._discourse_scroll_trackers) {
            try {
                window._discourse_scroll_trackers.forEach((tracker, i) => {
                    if (tracker && typeof tracker === 'function') {
                        window._discourse_scroll_trackers[i] = function() {};
                    }
                });
            } catch (e) {
                console.error("스크롤 트래커 비활성화 오류:", e);
            }
        }
        if (window.MessageBus && safeMode === false) {
            try {
                if (typeof window.MessageBus.baseInterval === 'number') {
                    window.MessageBus.baseInterval = 120000;
                }
                if (typeof window.MessageBus.unsubscribe === 'function') {
                    window.MessageBus.unsubscribe('/latest');
                    window.MessageBus.unsubscribe('/new');
                }
                console.log("MessageBus 설정 조정됨");
            } catch (e) {
                console.error("MessageBus 조정 오류:", e);
            }
        }
    }

    function findDiscourseContentContainer() {
        const candidates = [
            document.querySelector('.topic-list tbody'),
            document.querySelector('table.topic-list'),
            document.querySelector('.topic-list'),
            document.querySelector('.latest-topic-list'),
            document.querySelector('.category-list'),
            document.querySelector('#list-area')
        ];
        for (const c of candidates) if (c) return c;
        return null;
    }

    function collectAllItems() {
        const newItems = getDiscourseItems();
        allItems = newItems;
        lastItemCount = newItems.length;
        console.log(`${allItems.length}개의 아이템을 찾았습니다.`);
        if (isInitialized) {
            allItems.forEach(item => item.style.display = 'none');
        }
    }

    function getDiscourseItems() {
        if (!contentContainer) return [];
        const rows = contentContainer.querySelectorAll('tr.topic-list-item');
        if (rows.length > 0) return Array.from(rows);
        const topicItems = contentContainer.querySelectorAll('.latest-topic-list-item');
        if (topicItems.length > 0) return Array.from(topicItems);
        const alternateItems = contentContainer.querySelectorAll('.topic-list-item');
        if (alternateItems.length > 0) return Array.from(alternateItems);
        if (contentContainer.children.length > 0) return Array.from(contentContainer.children);
        return [];
    }

    function createPaginationInterface() {
        if (paginationContainer) paginationContainer.remove();

        paginationContainer = document.createElement('div');
        paginationContainer.className = 'custom-discourse-pagination';
        paginationContainer.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 20px 0;
            padding: 10px 15px;
            background-color: #ffffff;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            position: sticky;
            bottom: 10px;
            z-index: 1000;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            width: 100%;
            max-width: none;
            font-size: 12px;
            overflow-x: auto;
            white-space: nowrap;
            flex-wrap: nowrap;
        `;

        updatePaginationInterface();

        let inserted = false;
        const candidates = [
            document.querySelector('.topic-list'),
            document.querySelector('table.topic-list'),
            contentContainer,
            document.querySelector('.list-controls'),
            document.querySelector('#main-outlet'),
            document.querySelector('main .container'),
            document.body
        ];

        for (const c of candidates) {
            if (c && !inserted) {
                if (c === contentContainer) {
                    c.parentNode.insertBefore(paginationContainer, c.nextSibling);
                } else {
                    c.appendChild(paginationContainer);
                }
                inserted = true;
                break;
            }
        }
    }

    function updatePaginationInterface() {
        if (!paginationContainer) return;

        const totalItems = allItems.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);

        paginationContainer.innerHTML = '';

        if (currentPage > 1) addPageButton('<<', 1);
        if (currentPage > 1) addPageButton('<', currentPage - 1);

        const half = Math.floor(maxPages / 2);
        let startPage = currentPage - half;
        let endPage = currentPage + half;

        if (maxPages % 2 === 0) endPage -= 1;

        if (startPage < 1) {
            endPage += 1 - startPage;
            startPage = 1;
        }
        if (endPage > totalPages) {
            startPage -= (endPage - totalPages);
            endPage = totalPages;
            if (startPage < 1) startPage = 1;
        }

        let displayedPages = endPage - startPage + 1;
        if (displayedPages > maxPages) {
            endPage = startPage + maxPages - 1;
            if (endPage > totalPages) endPage = totalPages;
        }

        for (let i = startPage; i <= endPage; i++) {
            addPageButton(i.toString(), i, i === currentPage);
        }

        if (currentPage < totalPages) addPageButton('>', currentPage + 1);
        if (currentPage < totalPages) addPageButton('>>', totalPages);
    }

    function addPageButton(label, pageNum, isActive = false) {
        const button = document.createElement('button');
        button.textContent = label;
        button.dataset.page = pageNum;
        button.style.cssText = `
            margin: 0 3px;
            padding: 5px 10px;
            background-color: ${isActive ? '#0088cc' : '#f8f9fa'};
            color: ${isActive ? '#fff' : '#0088cc'};
            border: 1px solid ${isActive ? '#0088cc' : '#ddd'};
            border-radius: 3px;
            cursor: pointer;
            font-weight: ${isActive ? 'bold' : 'normal'};
            transition: all 0.2s ease;
            font-size: 12px;
            white-space: nowrap;
        `;
        button.addEventListener('click', () => {
            showPage(pageNum);
        });
        button.addEventListener('mouseover', () => {
            if (!isActive) button.style.backgroundColor = '#e9ecef';
        });
        button.addEventListener('mouseout', () => {
            if (!isActive) button.style.backgroundColor = '#f8f9fa';
        });
        paginationContainer.appendChild(button);
    }

    function showPage(pageNum) {
        if (!allItems.length) return;
        currentPage = pageNum;
        const startIdx = (pageNum - 1) * itemsPerPage;
        const endIdx = Math.min(startIdx + itemsPerPage, allItems.length);
        allItems.forEach(item => item.style.display = 'none');
        for (let i = startIdx; i < endIdx; i++) {
            if (allItems[i]) allItems[i].style.display = '';
        }
        console.log(`페이지 ${pageNum} 표시: ${endIdx - startIdx}개 아이템`);
        updatePaginationInterface();
        const scrollTarget = contentContainer.offsetTop - 100;
        window.scrollTo({top: Math.max(0, scrollTarget), behavior: 'smooth'});
        if (history.pushState) {
            try {
                const pageParam = new URLSearchParams(window.location.search);
                pageParam.set('custom_page', pageNum);
                const newUrl = window.location.pathname + '?' + pageParam.toString();
                window.history.replaceState({path: newUrl}, '', newUrl);
            } catch (e) {
                console.error("URL 업데이트 오류:", e);
            }
        }
    }

    function isInsideMedia(node) {
        if (!node) return false;
        let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        while (el) {
            const tag = el.tagName && el.tagName.toLowerCase();
            if (tag === 'video' || tag === 'audio' || tag === 'img' || tag === 'iframe') {
                return true;
            }
            el = el.parentElement;
        }
        return false;
    }

    function setupContentObserver() {
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutations) => {
            let needsUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    if (paginationContainer && (paginationContainer.contains(mutation.target) || mutation.target === paginationContainer)) {
                        continue;
                    }
                    if (isInsideMedia(mutation.target)) {
                        continue;
                    }
                    if (contentContainer.contains(mutation.target) || mutation.target === contentContainer) {
                        needsUpdate = true;
                        break;
                    }
                }
            }
            if (needsUpdate && !isUpdatingPagination) {
                isUpdatingPagination = true;
                setTimeout(() => {
                    console.log("콘텐츠 변경 감지됨, 페이지네이션 업데이트 중...");
                    const prevPage = currentPage;
                    collectAllItems();
                    updatePaginationInterface();
                    showPage(prevPage);
                    isUpdatingPagination = false;
                }, 300);
            }
        });

        observer.observe(contentContainer, {childList: true, subtree: true});
        console.log("콘텐츠 변화 감지 옵저버 설정됨");
    }

    function checkUrlForPageNumber() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            let pageParam = urlParams.get('custom_page');
            const totalItems = allItems.length;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            let pageNum = 1;
            if (pageParam !== null) {
                pageNum = parseInt(pageParam);
                if (isNaN(pageNum) || pageNum < 1) {
                    pageNum = 1;
                } else if (pageNum > totalPages) {
                    pageNum = totalPages > 0 ? totalPages : 1;
                }
            }
            console.log(`페이지 번호 결정: ${pageNum}`);
            currentPage = pageNum;
            showPage(pageNum);
        } catch (e) {
            console.error("URL 파라미터 확인 오류:", e);
            showPage(1);
        }
    }

})();