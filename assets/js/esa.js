// データベースを初期化
const db = new Dexie('esaDB');

db.version(1).stores({
    pets: '++id, name, type, image, order, idealMinDays, idealMaxDays',
    feeds: '++id, petId, date',
    meta: '&key, value'
});

// 初回
async function initializeOnce() {
    const initialized = await db.meta.get('isInitialized');
    if (!initialized) {
        await db.pets.add({
            name: 'ペット1（名前を入力してね）',
            type: 'ペットの種類を入力してね',
            order: 0
        });
        await db.meta.put({ key: 'isInitialized', value: true });
    }
}

// 2つの日付が同じ年月日かどうかを判定する関数
function isSameDay(date1, date2) {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

// 画像を32x32にリサイズする関数
function resizeImageToBase64(file, width = 32, height = 32) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = e => {
            img.src = e.target.result;
        };

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png')); // ← Base64 string
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// エサやり記録追加
async function recordFeed(petId) {
    const now = new Date();
    return await db.feeds.add({ petId, date: now });
}

// エサやり記録削除
async function undoFeed(petId) {
    const today = new Date();
    const feed = await db.feeds
        .where('petId').equals(petId)
        .toArray()
        .then(list => list.find(f => isSameDay(new Date(f.date), today)));
    if (feed) {
        await db.feeds.delete(feed.id);
    }
}

// 並び替え操作ボタン処理関数
async function movePetOrder(petId, direction) {
    const pets = await db.pets.orderBy('order').toArray();
    const index = pets.findIndex(p => p.id === petId);
    const swapIndex = index + direction;

    if (swapIndex < 0 || swapIndex >= pets.length) return;

    const container = document.getElementById('pet-list');
    const petElements = container.querySelectorAll('.pet-entry');

    const currentEl = petElements[index];
    const targetEl = petElements[swapIndex];

    // アニメーション用クラス
    currentEl.style.transition = 'transform 0.2s ease';
    targetEl.style.transition = 'transform 0.2s ease';
    const offset = currentEl.offsetHeight;

    currentEl.style.transform = `translateY(${direction * offset}px)`;
    targetEl.style.transform = `translateY(${-direction * offset}px)`;

    // 少し待ってから実際に入れ替え
    setTimeout(async () => {
        // リセット
        currentEl.style.transition = '';
        targetEl.style.transition = '';
        currentEl.style.transform = '';
        targetEl.style.transform = '';

        // 実際のデータ入れ替え
        const tempOrder = pets[index].order;
        pets[index].order = pets[swapIndex].order;
        pets[swapIndex].order = tempOrder;

        await db.pets.update(pets[index].id, { order: pets[index].order });
        await db.pets.update(pets[swapIndex].id, { order: pets[swapIndex].order });

        await renderPetList();
    }, 100);
}

// 並び変え開始ボタン
document.getElementById('reorder-toggle-btn').addEventListener('click', () => {
    document.body.classList.toggle('reorder-mode');
    renderPetList();
});

//並び変えボタンをアクティブにするか
function updateReorderButtonState() {
    db.pets.count(count => {
        const reorderBtn = document.getElementById('reorder-toggle-btn');
        reorderBtn.disabled = count <= 1;
    });
}

// ペット1匹の表示要素を作成
function createPetElement(pet, feeds, pastDates, today) {
    // メインコンテナ
    const div = document.createElement('div');
    div.classList.add('pet-entry');
    div.dataset.petId = pet.id;

    // 編集ボタン
    const editBtn = document.createElement('button');
    editBtn.classList.add('editPetBtn');
    editBtn.textContent = 'EDIT';
    editBtn.dataset.petId = pet.id;
    div.appendChild(editBtn);

    // 画像がある場合
    if (pet.image) {
        div.classList.add('has-image');
        const img = document.createElement('img');
        img.src = pet.image;
        img.classList.add('pet-image');
        img.alt = `${pet.name}のアイコン`;
        div.appendChild(img);
    } else {
        div.classList.add('no-image');
    }

    const info = document.createElement('div');
    info.classList.add('pet-info');
    info.innerHTML = `
        <span class="pet-type">${pet.type}</span>
        <span class="pet-name">${pet.name}</span>
    `;
    div.appendChild(info);

    // 前回のエサやり日からの経過日数
    const petFeeds = feeds
        .filter(f => f.petId === pet.id)
        .map(f => new Date(f.date));

    // 時刻切り捨て
    const getDateOnly = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const lastFeedDate = petFeeds.map(getDateOnly).sort((a, b) => b - a)[0];
    const todayDateOnly = getDateOnly(today);

    // 今日エサやりしていなければ、経過日数を計算
    if (lastFeedDate && lastFeedDate.getTime() !== todayDateOnly.getTime()) {
        const diffDays = Math.floor((todayDateOnly - lastFeedDate) / (1000 * 60 * 60 * 24));

        const lastFeedDiv = document.createElement('div');
        lastFeedDiv.className = 'last-feed';

        const lastFeedLabel = document.createElement('div');
        lastFeedLabel.className = 'last-feed-label';
        lastFeedLabel.textContent = '前回のエサ';

        const lastFeedDays = document.createElement('div');
        lastFeedDays.className = 'last-feed-days';
        if (diffDays === 1) {
            lastFeedDays.textContent = 'きのう';
        } else {
            const numberSpan = document.createElement('span');
            numberSpan.className = 'feed-days-number';
            numberSpan.textContent = diffDays;

            const unitSpan = document.createElement('span');
            unitSpan.className = 'feed-days-unit';
            unitSpan.textContent = '日前';

            lastFeedDays.appendChild(numberSpan);
            lastFeedDays.appendChild(unitSpan);
        }

        // エサやり頻度の判定
        let statusClass = '';
        if (typeof pet.idealMinDays === 'number' && diffDays < pet.idealMinDays) {
            statusClass = 'too-soon';
        } else if (typeof pet.idealMaxDays === 'number' && diffDays > pet.idealMaxDays) {
            statusClass = 'too-late';
        } else if (
            typeof pet.idealMinDays === 'number' ||
            typeof pet.idealMaxDays === 'number'
        ) {
            statusClass = 'ideal';
        }

        if (statusClass) {
            lastFeedDays.classList.add(statusClass);
        }

        // 要素を追加
        lastFeedDiv.appendChild(lastFeedLabel);
        lastFeedDiv.appendChild(lastFeedDays);

        div.appendChild(lastFeedDiv);
    }

    // 履歴表示
    const historyDiv = document.createElement('div');
    historyDiv.classList.add('feed-history');

    pastDates.forEach(date => {
        const isToday = isSameDay(date, today);
        const feed = feeds.find(f => f.petId === pet.id && isSameDay(new Date(f.date), date));
        const wrapper = document.createElement('div');
        wrapper.classList.add('history-item');

        if (isToday) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !!feed;
            checkbox.classList.add('today-feed-check');
            checkbox.dataset.petId = pet.id;

            checkbox.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    await recordFeed(pet.id);
                } else {
                    await undoFeed(pet.id);
                }
                await updatePetElement(pet.id);
            });

            const dateSpan = document.createElement('span');
            dateSpan.classList.add('date-label');

            const m = date.getMonth() + 1;
            const d = date.getDate();

            const monthSpan = document.createElement('span');
            monthSpan.className = 'month';
            monthSpan.textContent = m;

            const daySpan = document.createElement('span');
            daySpan.className = 'day';
            daySpan.textContent = d;

            dateSpan.appendChild(monthSpan);
            dateSpan.appendChild(daySpan);

            wrapper.appendChild(checkbox);
            wrapper.appendChild(dateSpan);
            wrapper.classList.add('is-today');
        } else {
            const span = document.createElement('span');

            if (feed) {
                span.classList.add('has-feed');

                const m = date.getMonth() + 1;
                const d = date.getDate();

                const monthSpan = document.createElement('span');
                monthSpan.className = 'month';
                monthSpan.textContent = m;

                const daySpan = document.createElement('span');
                daySpan.className = 'day';
                daySpan.textContent = d;

                span.appendChild(monthSpan);
                span.appendChild(daySpan);
            } else {
                span.classList.add('no-feed');
            }

            wrapper.appendChild(span);
        }

        historyDiv.appendChild(wrapper);
    });

    div.appendChild(historyDiv);

    // 編集ボタン → モーダル表示
    editBtn.addEventListener('click', async () => {
        const fullPetData = await db.pets.get(pet.id);
        openEditModal(fullPetData);
    });

    // 並び順編集時に表示
    if (document.body.classList.contains('reorder-mode')) {
        const upBtn = document.createElement('button');
        const downBtn = document.createElement('button');
        upBtn.textContent = '↑';
        downBtn.textContent = '↓';
        upBtn.className = 'reorder-up';
        downBtn.className = 'reorder-down';

        upBtn.addEventListener('click', () => movePetOrder(pet.id, -1));
        downBtn.addEventListener('click', () => movePetOrder(pet.id, 1));

        const reorderControls = document.createElement('div');
        reorderControls.className = 'reorder-controls';
        reorderControls.appendChild(upBtn);
        reorderControls.appendChild(downBtn);

        div.appendChild(reorderControls);
    }

    return div;
}

// ペット1匹のDOMを更新（差し替え）
async function updatePetElement(petId) {
    const pet = await db.pets.get(petId);
    const feeds = await db.feeds.toArray();
    feeds.sort((a, b) => new Date(a.date) - new Date(b.date));
    const today = new Date();
    const pastDates = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        pastDates.push(d);
    }

    const newElement = createPetElement(pet, feeds, pastDates, today);
    const container = document.getElementById('pet-list');
    const oldElement = container.querySelector(`.pet-entry[data-pet-id="${petId}"]`);

    // 置き換え
    if (oldElement) {
        container.replaceChild(newElement, oldElement);
    }

    // まとめてエサチェックボックス更新
    updateBulkCheckboxState();
}

// まとめてエサチェックボックスの状態を更新する関数
function updateBulkCheckboxState() {
    const bulkCheckbox = document.getElementById('bulk-feed-checkbox');
    if (!bulkCheckbox) return;

    db.pets.toArray().then(async (pets) => {
        const feeds = await db.feeds.toArray();
        const today = new Date();
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        let checkedCount = 0;

        for (const pet of pets) {
            const hasFeed = feeds.some(f => f.petId === pet.id && isSameDay(new Date(f.date), todayDate));
            if (hasFeed) checkedCount++;
        }

        if (checkedCount === pets.length && pets.length > 0) {
            bulkCheckbox.checked = true;
            bulkCheckbox.indeterminate = false;
        } else if (checkedCount === 0) {
            bulkCheckbox.checked = false;
            bulkCheckbox.indeterminate = false;
        } else {
            bulkCheckbox.checked = false;
            bulkCheckbox.indeterminate = true;
        }
    });
}

// ペット一覧を描画（初回 or 全体更新用）
async function renderPetList() {
    const pets = await db.pets.orderBy('order').toArray();
    const feeds = await db.feeds.toArray();
    feeds.sort((a, b) => new Date(a.date) - new Date(b.date));
    const today = new Date();

    const pastDates = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        pastDates.push(d);
    }

    const container = document.getElementById('pet-list');
    container.innerHTML = '';

    const headerMenu = document.getElementById('header-menu-container');

    // 一旦まとめチェックがあるなら削除（再描画のたび）
    const existingBulk = document.getElementById('bulk-feed-checkbox-container');
    if (existingBulk) existingBulk.remove();

    if (pets.length === 0) {
        container.innerHTML = '<p id="empty-message">表示するペットがいません。</p>';
        return;
    }

    // まとめてチェックボックス
    const bulkContainer = document.createElement('div');
    bulkContainer.id = 'bulk-feed-checkbox-container';

    const bulkLabel = document.createElement('label');
    const bulkCheckbox = document.createElement('input');
    bulkCheckbox.type = 'checkbox';
    bulkCheckbox.id = 'bulk-feed-checkbox';
    bulkLabel.appendChild(document.createTextNode('まとめてエサ'));
    bulkLabel.appendChild(bulkCheckbox);

    bulkContainer.appendChild(bulkLabel);
    headerMenu.appendChild(bulkContainer);

    // チェック状態を初期化（今日すでに全員にエサやり済みか）
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const petIdsWithTodayFeed = feeds
        .filter(f => isSameDay(new Date(f.date), todayDate))
        .map(f => f.petId);

    if (pets.every(pet => petIdsWithTodayFeed.includes(pet.id))) {
        bulkCheckbox.checked = true;
    }

    // チェックボックスのイベント
    bulkCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;

        // 最新のfeedsを取得
        const freshFeeds = await db.feeds.toArray();
        const today = new Date();
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        for (const pet of pets) {
            const hasFeed = freshFeeds.some(f => f.petId === pet.id && isSameDay(new Date(f.date), todayDate));

            if (isChecked) {
                // まだ記録されていない場合のみ追加
                if (!hasFeed) {
                    await recordFeed(pet.id);
                }
            } else {
                // 今日の記録があれば削除
                if (hasFeed) {
                    const feed = freshFeeds.find(f => f.petId === pet.id && isSameDay(new Date(f.date), todayDate));
                    if (feed) {
                        await db.feeds.delete(feed.id);
                    }
                }
            }
        }

        // 再描画でチェック更新
        await renderPetList();
    });

    // ペット一覧描画
    for (const pet of pets) {
        const petElement = createPetElement(pet, feeds, pastDates, today);
        container.appendChild(petElement);
    }

    // まとめてエサチェックボックス更新
    updateBulkCheckboxState();

    // 並び変えボタンをアクティブにするか
    updateReorderButtonState()
}

// 設定モーダル
function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = '<h2>設定</h2><button type="button" id="close-settings-btn">閉じる</button><br><br>';

    modalContent.querySelector('#close-settings-btn').addEventListener('click', closeModal);

    // ペット削除UIを作る
    db.pets.toArray().then(pets => {
        if (pets.length === 0) {
            modalContent.innerHTML += '<p>削除できるペットがいません。</p>';
        } else {
            const form = document.createElement('form');
            form.innerHTML = `
                <label>
                    削除するペットを選択:
                    <select id="delete-pet-select">
                        ${pets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                    </select>
                </label>
                <button type="submit">削除</button>
            `;

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const select = form.querySelector('#delete-pet-select');
                const petId = Number(select.value);

                const confirmed = confirm('本当に削除しますか？');
                if (confirmed) {
                    // 関連するエサやり記録を削除
                    await db.feeds
                        .where('petId')
                        .equals(petId)
                        .delete();

                    // ペット本体を削除
                    await db.pets.delete(petId);

                    // UI更新
                    await renderPetList();
                    updateReorderButtonState();
                    closeModal();
                }
            });

            modalContent.appendChild(form);
        }

        // エクスポートボタン
        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'データを書き出す（エクスポート）';
        exportBtn.style.display = 'block';
        exportBtn.style.marginTop = '20px';
        exportBtn.addEventListener('click', async () => {
            const pets = await db.pets.toArray();
            const feeds = await db.feeds.toArray();
            const data = { pets, feeds };
            const jsonStr = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pets-data.json';
            a.click();
            URL.revokeObjectURL(url);
        });
        modalContent.appendChild(exportBtn);

        // インポート用ファイル選択
        const importLabel = document.createElement('label');
        importLabel.textContent = 'データを読み込む（インポート）: ';
        importLabel.style.display = 'block';
        importLabel.style.marginTop = '20px';

        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = 'application/json';

        importLabel.appendChild(importInput);
        modalContent.appendChild(importLabel);

        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (!data.pets || !data.feeds) {
                        alert('不正なデータ形式です');
                        return;
                    }
                    const confirmed = confirm('インポートすると現在のデータは全て上書きされます。本当によろしいですか？');
                    if (!confirmed) return;
                    await db.pets.clear();
                    await db.feeds.clear();
                    await db.pets.bulkAdd(data.pets);
                    await db.feeds.bulkAdd(data.feeds);
                    alert('インポート成功しました！');
                    await renderPetList();
                    updateReorderButtonState();
                    closeModal();
                } catch {
                    alert('データの読み込みに失敗しました');
                }
            };
            reader.readAsText(file);
        });
    });

    modal.style.display = 'flex';
}

// 編集モーダル
function openEditModal(pet, options = {}) {
    // 初期表示タブ
    const activeTab = options.activeTab || 'history';

    const modal = document.getElementById('edit-modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>ペットを編集</h2>
            <button type="button" class="modal-close-btn" id="close-edit-btn">編集画面を閉じる</button>
        </div>
        <div class="tab-header">
            <button class="tab-btn active" data-tab="info">基本情報</button>
            <button class="tab-btn" data-tab="history">履歴編集</button>
        </div>
        <div class="tab-content" id="tab-info"></div>
        <div class="tab-content" id="tab-history" style="display:none;"></div>
    `;

    // モーダル閉じるボタン
    modalContent.querySelector('#close-edit-btn').addEventListener('click', closeModal);

    // タブ切り替え
    const tabButtons = modalContent.querySelectorAll('.tab-btn');
    const tabContents = modalContent.querySelectorAll('.tab-content');

    function switchTab(tabName) {
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => {
            c.style.display = c.id === `tab-${tabName}` ? 'block' : 'none';
        });
        const activeBtn = modalContent.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    switchTab(activeTab); // 初期表示タブを選択

    const form = document.createElement('form');
    form.innerHTML = `
        <h2>ペットを編集</h2>
        <label>
            名前: <input type="text" name="name" value="${pet.name}" required>
        </label><br>
        <label>
            種類: <input type="text" name="type" value="${pet.type}" required>
        </label><br>
        <label>
            画像変更: <input type="file" name="image" accept="image/*">
        </label><br>
        <div id="current-image-preview" style="margin: 8px 0;">
            ${pet.image ? `<img src="${pet.image}" width="32" height="32" alt="現在の画像"><br>` : '（画像なし）'}
        </div>
        <button type="button" id="delete-image-btn">画像を削除</button><br><br>
        <p>餌やり頻度(任意)</p>
        <label>
            最短<input type="number" name="idealMinDays" value="${pet.idealMinDays ?? ''}" min="1" style="width: 4em;">日に一回
        </label><br>
        <label>
            最長<input type="number" name="idealMaxDays" value="${pet.idealMaxDays ?? ''}" min="1" style="width: 4em;">日に一回
        </label><br><br>
        <button type="submit">これでOK</button>
    `;

    let newImage = null; // 新しく選ばれた画像（Base64）

    // 画像がアップロードされたら Base64 に変換
    form.elements['image'].addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            newImage = await resizeImageToBase64(file, 32, 32); // 32x32 に変換して保存
            const preview = form.querySelector('#current-image-preview');
            preview.innerHTML = `<img src="${newImage}" width="32" height="32"><br>`;
        }
    });

    // 「画像を削除」ボタン処理
    form.querySelector('#delete-image-btn').addEventListener('click', () => {
        newImage = null;
        form.elements['image'].value = ''; // ファイル選択リセット
        const preview = form.querySelector('#current-image-preview');
        preview.innerHTML = '（画像なし）';
    });

    // フォーム送信でDB更新
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.elements['name'].value;
        const type = form.elements['type'].value;

        const updatedFields = { name, type };

        // ファイルが選ばれている → 画像を新しくする
        if (form.elements['image'].files.length > 0) {
            updatedFields.image = newImage;
        }

        // ファイルが選ばれていない & 元画像がある & preview が空になってる → 削除された
        const preview = form.querySelector('#current-image-preview');
        if (
            form.elements['image'].files.length === 0 &&
            pet.image &&
            !preview.querySelector('img')
        ) {
            updatedFields.image = null;
        }

        // エサやり間隔
        const idealMinInput = form.elements['idealMinDays'].value;
        const idealMaxInput = form.elements['idealMaxDays'].value;

        updatedFields.idealMinDays = idealMinInput === '' ? null : parseInt(idealMinInput, 10);
        updatedFields.idealMaxDays = idealMaxInput === '' ? null : parseInt(idealMaxInput, 10);

        await db.pets.update(pet.id, updatedFields);
        closeModal();
        await updatePetElement(pet.id);
    });

    modalContent.querySelector('#tab-info').appendChild(form);

    // 履歴編集タブ
    (async () => {
        const historyContainer = modalContent.querySelector('#tab-history');

        // かんたん日付追加フォーム
        const quickAddContainer = document.createElement('div');
        quickAddContainer.innerHTML = `
            <label>
                <select id="quick-days-select">
                    <option value="1">昨日</option>
                    <option value="2">おととい</option>
                    <option value="3">3日前</option>
                </select>
            </label>
            <button type="button" id="quick-add-btn">に餌やりした</button>
        `;
        historyContainer.appendChild(quickAddContainer);

        // かんたん日付追加
        quickAddContainer.querySelector('#quick-add-btn').addEventListener('click', async () => {
            const days = Number(quickAddContainer.querySelector('#quick-days-select').value);
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - days);

            const currentFeeds = await db.feeds.where('petId').equals(pet.id).toArray();
            const exists = currentFeeds.some(f => isSameDay(new Date(f.date), targetDate));

            if (exists) {
                alert('その日はすでに記録があります');
                return;
            }

            await db.feeds.add({
                petId: pet.id,
                date: targetDate
            });

            await updatePetElement(pet.id);
            openEditModal(pet, { activeTab: 'history' });
        });

        // 日付追加フォーム
        const addForm = document.createElement('form');
        addForm.innerHTML = `
            <input type="date" name="feedDate" required>
            <button type="submit">追加</button>
        `;
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = addForm.elements['feedDate'].value;
            if (!date) return;

            const exists = feeds.some(f => isSameDay(new Date(f.date), new Date(date)));
            if (exists) {
                alert('その日はすでに記録があります');
                return;
            }

            await db.feeds.add({
                petId: pet.id,
                date: new Date(date)
            });

            await updatePetElement(pet.id);
            openEditModal(pet, { activeTab: 'history' });
        });
        historyContainer.appendChild(addForm);

        // 履歴
        const feeds = await db.feeds.where('petId').equals(pet.id).toArray();
        feeds.sort((a, b) => new Date(b.date) - new Date(a.date));

        const list = document.createElement('ul');
        feeds.forEach(feed => {
            const li = document.createElement('li');
            const dateStr = new Date(feed.date).toLocaleDateString();
            li.innerHTML = `
            <span>${dateStr}</span>
            <button data-id="${feed.id}">削除</button>
        `;
            list.appendChild(li);
        });
        historyContainer.appendChild(list);

        // 削除処理
        list.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = Number(btn.dataset.id);
                await db.feeds.delete(id);
                await updatePetElement(pet.id);
                openEditModal(pet, { activeTab: 'history' });
            });
        });
    })();

    modal.style.display = 'flex';
}

// モーダルを閉じる
function closeModal() {
    document.querySelectorAll('#settings-modal, #edit-modal, #add-modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// ペット追加モーダル
function openAddModal() {
    const modal = document.getElementById('add-modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = `
        <h2>ペットを追加</h2>
        <form id="add-form">
            <label>
                名前:<input type="text" name="name" required>
            </label><br>
            <label>
                種類:<input type="text" name="type" required>
            </label><br>
            <label>
                アイコン画像(32x32): <input type="file" name="image" accept="image/*">
            </label><br>
            <div id="current-image-preview" style="margin: 8px 0;">（画像なし）</div>
            <button type="button" id="delete-image-btn">画像を削除</button><br><br>
            <p>餌やり頻度(任意)</p>
            <label>
                最短<input type="number" name="idealMinDays" value="" min="1" style="width: 4em;">日に一回
            </label><br>
            <label>
                最長<input type="number" name="idealMaxDays" value="" min="1" style="width: 4em;">日に一回
            </label><br><br>
            <button type="button" id="cancel-add-btn">キャンセル</button>
            <button type="submit">これでOK</button>
        </form>
    `;

    const form = modalContent.querySelector('#add-form');
    const imageInput = form.elements['image'];
    const preview = form.querySelector('#current-image-preview');

    let newImage = null;

    // 画像がアップロードされたらプレビュー＆Base64変換
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            newImage = await resizeImageToBase64(file);
            preview.innerHTML = `<img src="${newImage}" width="32" height="32"><br>`;
        }
    });

    // 画像削除ボタン
    form.querySelector('#delete-image-btn').addEventListener('click', () => {
        newImage = null;
        imageInput.value = '';
        preview.innerHTML = '（画像なし）';
    });

    // キャンセル
    form.querySelector('#cancel-add-btn').addEventListener('click', closeModal);

    // 送信で保存＆描画
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.elements['name'].value;
        const type = form.elements['type'].value;

        const petCount = await db.pets.count();
        const newPet = { name, type, order: petCount };
        if (newImage) {
            newPet.image = newImage;
        }

        const idealMinInput = form.elements['idealMinDays'].value;
        const idealMaxInput = form.elements['idealMaxDays'].value;

        if (idealMinInput !== '') {
            newPet.idealMinDays = parseInt(idealMinInput, 10);
        }
        if (idealMaxInput !== '') {
            newPet.idealMaxDays = parseInt(idealMaxInput, 10);
        }

        const petId = await db.pets.add(newPet);
        closeModal();

        const pet = await db.pets.get(petId);
        const feeds = await db.feeds.toArray();
        feeds.sort((a, b) => new Date(a.date) - new Date(b.date));
        const today = new Date();
        const pastDates = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            pastDates.push(d);
        }

        const newElement = createPetElement(pet, feeds, pastDates, today);
        const container = document.getElementById('pet-list');
        container.appendChild(newElement);

        // 「表示するペットがいません。」メッセージがあれば消す
        const emptyMsg = document.getElementById('empty-message');
        if (emptyMsg) emptyMsg.remove();

        // 並び変えボタンをアクティブにするか
        updateReorderButtonState()
    });

    modal.style.display = 'flex';
}

// 日付変更時の再描画
function scheduleMidnightRefresh() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);

    const timeout = nextMidnight - now;

    setTimeout(() => {
        renderPetList();
        scheduleMidnightRefresh();
    }, timeout);
}

// アプリ起動
async function startApp() {
    await initializeOnce();
    await renderPetList();
}
startApp();
scheduleMidnightRefresh();

// 追加ボタンイベント
document.getElementById('add-pet-btn').addEventListener('click', openAddModal);

// 設定ボタンイベント
document.getElementById('settings-btn').addEventListener('click', openSettingsModal);