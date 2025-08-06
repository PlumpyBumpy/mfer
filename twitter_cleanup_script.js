// Twitter/X Feed Cleanup Script for Chrome
// Автоматически удаляет собственные твиты и отменяет репосты

(function() {
    'use strict';
    
    // Конфигурация
    const CONFIG = {
        minDelay: 1000,  // 1 секунда
        maxDelay: 3000,  // 3 секунды
        maxRetries: 3,
        scrollPause: 2000 // Пауза перед прокруткой
    };
    
    // Логирование
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[Twitter Cleanup ${timestamp}]`;
        
        switch(type) {
            case 'error':
                console.error(prefix, message);
                break;
            case 'warn':
                console.warn(prefix, message);
                break;
            case 'success':
                console.log(`%c${prefix} ${message}`, 'color: green');
                break;
            default:
                console.log(prefix, message);
        }
    }
    
    // Случайная задержка
    function randomDelay() {
        const delay = Math.random() * (CONFIG.maxDelay - CONFIG.minDelay) + CONFIG.minDelay;
        return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Ожидание элемента
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            function check() {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Element ${selector} not found within ${timeout}ms`));
                    return;
                }
                
                setTimeout(check, 100);
            }
            
            check();
        });
    }
    
    // Симуляция клика с человеческой задержкой
    async function humanClick(element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await randomDelay();
        
        // Создаем событие клика
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        
        element.dispatchEvent(event);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Получить имя пользователя
    function getCurrentUsername() {
        // Попробуем найти имя пользователя в различных местах
        const selectors = [
            '[data-testid="SideNav_AccountSwitcher_Button"] [dir="ltr"]',
            '[data-testid="UserName"]',
            'a[href^="/"][href$=""]',
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.startsWith('@')) {
                return element.textContent.trim();
            }
        }
        
        // Попробуем получить из URL профиля
        const profileLinks = document.querySelectorAll('a[href^="/"]');
        for (const link of profileLinks) {
            const href = link.getAttribute('href');
            if (href && href.match(/^\/[a-zA-Z0-9_]+$/) && !href.includes('/')) {
                return '@' + href.substring(1);
            }
        }
        
        return null;
    }
    
    // Проверка, является ли твит собственным
    function isOwnTweet(tweetElement) {
        const currentUser = getCurrentUsername();
        if (!currentUser) {
            log('Не удалось определить текущего пользователя', 'warn');
            return false;
        }
        
        // Ищем автора твита
        const authorElement = tweetElement.querySelector('[data-testid="User-Name"] a[role="link"]');
        if (!authorElement) return false;
        
        const authorHref = authorElement.getAttribute('href');
        const authorUsername = authorHref ? '@' + authorHref.substring(1) : null;
        
        return authorUsername === currentUser;
    }
    
    // Проверка, является ли элемент репостом
    function isRepost(tweetElement) {
        // Ищем индикаторы репоста
        const repostIndicators = [
            '[data-testid="socialContext"]', // "X retweeted" text
            'svg[data-testid="icon-retweet"]', // Retweet icon
            '[data-testid="retweet"]'
        ];
        
        for (const selector of repostIndicators) {
            const indicator = tweetElement.querySelector(selector);
            if (indicator) {
                const text = indicator.textContent || '';
                if (text.includes('reposted') || text.includes('retweeted') || 
                    text.includes('репост') || text.includes('ретвит')) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // Удаление собственного твита
    async function deleteTweet(tweetElement) {
        try {
            log('Удаляем собственный твит...');
            
            // Ищем кнопку "More" (три точки)
            const moreButton = tweetElement.querySelector('[data-testid="caret"]') || 
                              tweetElement.querySelector('[aria-label*="More"]') ||
                              tweetElement.querySelector('button[aria-haspopup="menu"]');
            
            if (!moreButton) {
                throw new Error('Кнопка "More" не найдена');
            }
            
            await humanClick(moreButton);
            log('Нажали кнопку "More"');
            
            // Ждем появления меню и ищем "Delete"
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const deleteButton = await waitForElement('[data-testid="Dropdown"] [role="menuitem"]', 3000)
                .then(() => {
                    const menuItems = document.querySelectorAll('[data-testid="Dropdown"] [role="menuitem"]');
                    for (const item of menuItems) {
                        const text = item.textContent.toLowerCase();
                        if (text.includes('delete') || text.includes('удалить')) {
                            return item;
                        }
                    }
                    return null;
                });
            
            if (!deleteButton) {
                throw new Error('Кнопка "Delete" не найдена в меню');
            }
            
            await humanClick(deleteButton);
            log('Нажали "Delete"');
            
            // Ждем появления диалога подтверждения
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const confirmButton = await waitForElement('[data-testid="confirmationSheetConfirm"]', 3000);
            await humanClick(confirmButton);
            
            log('Твит удален успешно', 'success');
            return true;
            
        } catch (error) {
            log(`Ошибка при удалении твита: ${error.message}`, 'error');
            return false;
        }
    }
    
    // Отмена репоста
    async function undoRepost(tweetElement) {
        try {
            log('Отменяем репост...');
            
            // Ищем кнопку репоста
            const repostButton = tweetElement.querySelector('[data-testid="retweet"]') ||
                                tweetElement.querySelector('[data-testid="unretweet"]') ||
                                tweetElement.querySelector('button[aria-label*="Repost"]') ||
                                tweetElement.querySelector('button[aria-label*="Undo repost"]');
            
            if (!repostButton) {
                throw new Error('Кнопка репоста не найдена');
            }
            
            await humanClick(repostButton);
            log('Нажали кнопку репоста');
            
            // Ждем появления меню
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Ищем "Undo repost" в выпадающем меню
            const undoButton = await waitForElement('[data-testid="unretweetConfirm"]', 3000)
                .catch(() => {
                    // Альтернативный поиск
                    const menuItems = document.querySelectorAll('[role="menuitem"]');
                    for (const item of menuItems) {
                        const text = item.textContent.toLowerCase();
                        if (text.includes('undo repost') || text.includes('отменить репост')) {
                            return item;
                        }
                    }
                    return null;
                });
            
            if (!undoButton) {
                throw new Error('Кнопка "Undo repost" не найдена');
            }
            
            await humanClick(undoButton);
            log('Репост отменен успешно', 'success');
            return true;
            
        } catch (error) {
            log(`Ошибка при отмене репоста: ${error.message}`, 'error');
            return false;
        }
    }
    
    // Получение всех твитов на странице
    function getTweets() {
        const tweetSelectors = [
            '[data-testid="tweet"]',
            '[data-testid="tweetText"]',
            'article[data-testid="tweet"]'
        ];
        
        for (const selector of tweetSelectors) {
            const tweets = document.querySelectorAll(selector);
            if (tweets.length > 0) {
                return Array.from(tweets);
            }
        }
        
        return [];
    }
    
    // Прокрутка страницы для загрузки новых твитов
    async function scrollToLoadMore() {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, CONFIG.scrollPause));
    }
    
    // Основная функция очистки
    async function cleanupFeed() {
        log('Начинаем очистку ленты Twitter/X');
        
        const currentUser = getCurrentUsername();
        if (!currentUser) {
            log('Не удалось определить текущего пользователя. Убедитесь, что вы авторизованы.', 'error');
            return;
        }
        
        log(`Текущий пользователь: ${currentUser}`);
        
        let processedCount = 0;
        let deletedCount = 0;
        let unpostedCount = 0;
        let lastProcessedCount = 0;
        let noProgressCount = 0;
        
        while (true) {
            const tweets = getTweets();
            
            if (tweets.length === 0) {
                log('Твиты не найдены');
                break;
            }
            
            log(`Найдено ${tweets.length} твитов на странице`);
            
            let processedInThisRound = 0;
            
            for (const tweet of tweets) {
                // Пропускаем уже обработанные твиты
                if (tweet.dataset.processed) {
                    continue;
                }
                
                tweet.dataset.processed = 'true';
                processedInThisRound++;
                
                try {
                    if (isOwnTweet(tweet)) {
                        log('Найден собственный твит');
                        const success = await deleteTweet(tweet);
                        if (success) {
                            deletedCount++;
                        }
                    } else if (isRepost(tweet)) {
                        log('Найден репост');
                        const success = await undoRepost(tweet);
                        if (success) {
                            unpostedCount++;
                        }
                    } else {
                        log('Пропускаем чужой твит');
                    }
                    
                    // Случайная задержка между действиями
                    await randomDelay();
                    
                } catch (error) {
                    log(`Ошибка при обработке твита: ${error.message}`, 'error');
                }
                
                processedCount++;
                
                // Выводим прогресс каждые 10 твитов
                if (processedCount % 10 === 0) {
                    log(`Прогресс: обработано ${processedCount}, удалено ${deletedCount}, отменено репостов ${unpostedCount}`);
                }
            }
            
            // Проверяем прогресс
            if (processedInThisRound === 0) {
                noProgressCount++;
                if (noProgressCount >= 3) {
                    log('Не удается найти новые твиты для обработки. Завершаем работу.');
                    break;
                }
            } else {
                noProgressCount = 0;
            }
            
            // Прокручиваем для загрузки новых твитов
            await scrollToLoadMore();
            
            // Защита от бесконечного цикла
            if (processedCount > 1000) {
                log('Достигнут лимит обработанных твитов (1000). Останавливаем скрипт.', 'warn');
                break;
            }
        }
        
        log(`Очистка завершена! Обработано: ${processedCount}, удалено твитов: ${deletedCount}, отменено репостов: ${unpostedCount}`, 'success');
    }
    
    // Функция для остановки скрипта
    window.stopTwitterCleanup = function() {
        log('Скрипт остановлен пользователем', 'warn');
        window.cleanupRunning = false;
    };
    
    // Запуск скрипта
    if (window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com')) {
        log('Скрипт загружен. Для запуска выполните: cleanupFeed()');
        log('Для остановки выполните: stopTwitterCleanup()');
        
        // Экспортируем функции в глобальную область
        window.cleanupFeed = cleanupFeed;
        window.cleanupRunning = true;
        
        // Автозапуск (раскомментируйте следующую строку для автоматического запуска)
        // cleanupFeed();
        
    } else {
        log('Этот скрипт работает только на twitter.com или x.com', 'error');
    }
    
})();