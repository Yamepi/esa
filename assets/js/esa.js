// データベースを初期化
const db = new Dexie('esaDB');

db.version(1).stores({
    pets: '++id, name, type',
    feeds: '++id, petId, date',
    meta: '&key, value'
});

// 初回
async function initializeOnce() {
    const initialized = await db.meta.get('isInitialized');
    if (!initialized) {
        await db.pets.add({
            name: 'ペット1（名前を入力してね）',
            type: 'ペットの種類を入力してね'
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

// ペット1匹の表示要素を作成
function createPetElement(pet, feeds, pastDates, today) {
    // 今日餌やりしたか確認
    const todayFeed = feeds.find(f => f.petId === pet.id && isSameDay(new Date(f.date), today));
    // DOM作成
    const div = document.createElement('div');
    div.classList.add('pet-entry');
    div.dataset.petId = pet.id;

    div.innerHTML = `
        <label>
            <button class="editPetBtn" data-pet-id="${pet.id}">名前を編集</button>
            <span class="pet-type">${pet.type}</span>/
            <span class="pet-name">${pet.name}</span>
            <input type="checkbox" data-pet-id="${pet.id}" ${todayFeed ? 'checked' : ''}>
        </label>
    `;

    // 餌やり履歴表示部分
    const historyDiv = document.createElement('div');
    historyDiv.classList.add('feed-history');

    // 過去の履歴表示
    for (const date of pastDates) {
        const feed = feeds.find(f =>
            f.petId === pet.id && isSameDay(new Date(f.date), date)
        );

        const span = document.createElement('span');
        span.style.marginRight = '6px';

        if (feed) {
            const m = date.getMonth() + 1;
            const d = date.getDate();
            span.innerHTML = `<span class="month">${m}</span>/<span class="day">${d}</span>`;
        } else {
            span.textContent = '・';
            span.classList.add('no-feed');
        }

        historyDiv.appendChild(span);
    }

    div.appendChild(historyDiv);

    // 編集ボタン
    div.querySelector('.editPetBtn').addEventListener('click', async () => {
        const fullPetData = await db.pets.get(pet.id);
        openEditModal(fullPetData);
    });

    // チェックボックス変更時
    div.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        if (e.target.checked) {
            await recordFeed(pet.id);
        } else {
            await undoFeed(pet.id);
        }
        await updatePetElement(pet.id); // 一部再描画
    });

    return div;
}

// ペット1匹のDOMを更新（差し替え）
async function updatePetElement(petId) {
    const pet = await db.pets.get(petId);
    const feeds = await db.feeds.toArray();
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
}

// ペット一覧を描画（初回 or 全体更新用）
async function renderPetList() {
    const pets = await db.pets.toArray();
    const feeds = await db.feeds.toArray();
    const today = new Date();

    const pastDates = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        pastDates.push(d);
    }

    const container = document.getElementById('pet-list');
    container.innerHTML = '';

    if (pets.length === 0) {
        container.innerHTML = '<p>表示するペットがいません。</p>';
        return;
    }

    for (const pet of pets) {
        const petElement = createPetElement(pet, feeds, pastDates, today);
        container.appendChild(petElement);
    }
}

// 編集モーダル
function openEditModal(pet) {
    const modal = document.getElementById('edit-modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = `
        <h2>名前を編集</h2>
        <form id="edit-form">
            <label>
                名前:<input type="text" name="name" value="${pet.name}" required>
            </label><br>
            <label>
                種類:<input type="text" name="type" value="${pet.type}" required>
            </label><br>
            <button type="button" id="cancel-edit-btn">キャンセル</button>
            <button type="submit">これでOK</button>
        </form>
    `;

    modalContent.querySelector('#cancel-edit-btn').addEventListener('click', closeModal);

    modalContent.querySelector('#edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const name = form.elements['name'].value;
        const type = form.elements['type'].value;

        await db.pets.update(pet.id, { name, type });
        closeModal();
        await updatePetElement(pet.id); // ここも一部だけ再描画
    });

    modal.style.display = 'flex';
}

// モーダルを閉じる
function closeModal() {
    document.querySelectorAll('#edit-modal, #add-modal').forEach(modal => {
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
            <button type="button" id="cancel-add-btn">キャンセル</button>
            <button type="submit">これでOK</button>
        </form>
    `;

    modalContent.querySelector('#cancel-add-btn').addEventListener('click', closeModal);

    modalContent.querySelector('#add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const name = form.elements['name'].value;
        const type = form.elements['type'].value;

        const petId = await db.pets.add({ name, type });
        closeModal();
        await updatePetElement(petId); // 追加分だけ描画
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