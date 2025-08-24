// データベースを初期化
const db = new Dexie('esaDB');

db.version(1).stores({
    pets: '++id, name, type',
    feeds: '++id, petId, date',
    meta: '&key, value'
});

// 初回の仮データ
async function initializeOnce() {
    // 初期化済みのフラグがあるかどうかチェック
    const initialized = await db.meta.get('isInitialized');
    // まだ初期化してない場合は仮ペット追加
    if (!initialized) {
        await db.pets.add({
            name: 'ペット1（名前を入力してね）',
            type: 'ペットの種類を入力してね'
        });
        // 初期化済みのフラグ追加
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

// エサやり記録追加(チェックON)
async function recordFeed(petId) {
    // 日時
    const now = new Date();
    // db.feeds に新しいエサやりの記録を追加
    const feedId = await db.feeds.add({
        petId,
        date: now
    });
    // 追加したエサやりの記録のIDを返す
    return feedId;
}

// エサやり記録削除(チェックOFF)
async function undoFeed(petId) {
    const today = new Date();

    const feed = await db.feeds
        .where('petId').equals(petId)
        .toArray()
        .then(list => list.find(f => isSameDay(new Date(f.date), today)));

    if (feed) {
        await db.feeds.delete(feed.id);
    } else {
        console.warn('今日のエサやり記録が見つかりませんでした');
    }
}

// ペット一覧を描画
async function renderPetList() {
    // dbからデータ取得
    const pets = await db.pets.toArray();
    const feeds = await db.feeds.toArray();
    // 今日の日付
    const today = new Date();

    const container = document.getElementById('pet-list');
    // 要素の中身をクリア
    container.innerHTML = '';

    // ペットなしの場合
    if (pets.length === 0) {
        container.innerHTML = '<p>表示するペットがいません。</p>';
        return;
    }

    // 直近14日分の日付を作成
    const pastDates = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        pastDates.push(d);
    }

    // pets内の各petについて処理を行う
    for (const pet of pets) {
        // 今日そのペットに餌をあげたかどうか
        const todayFeed = feeds.find(f => {
            return f.petId === pet.id && isSameDay(new Date(f.date), today);
        });

        // div要素作成、餌をあげたならチェック状態に
        const div = document.createElement('div');
        div.classList.add('pet-entry');

        // 編集・チェックボックス部
        div.innerHTML = `
            <label>
                <button class="editPetBtn" data-pet-id="${pet.id}">名前を編集</button>
                <span class="pet-type">${pet.type}</span>/
                <span class="pet-name">${pet.name}</span>
                <input type="checkbox" data-pet-id="${pet.id}" ${todayFeed ? 'checked' : ''}>
            </label>
        `;

        // 餌やり履歴部
        const historyDiv = document.createElement('div');
        historyDiv.classList.add('feed-history');

        // 過去14日分を表示
        // 日付 or ・ を表示
        for (const date of pastDates) {
            const feed = feeds.find(f =>
                f.petId === pet.id && isSameDay(new Date(f.date), date)
            );

            const span = document.createElement('span');
            span.style.marginRight = '6px';

            if (feed) {
                const m = date.getMonth() + 1;
                const d = date.getDate();

                span.innerHTML = `
            <span class="month">${m}</span>
            <span class="slash">/</span>
            <span class="day">${d}</span>
        `;
            } else {
                span.textContent = '・';
                span.classList.add('no-feed');
            }

            historyDiv.appendChild(span);
        }

        div.appendChild(historyDiv);
        container.appendChild(div);

        // 編集ボタン
        div.querySelector('.editPetBtn').addEventListener('click', async () => {
            const fullPetData = await db.pets.get(pet.id);
            openEditModal(fullPetData);
        });
    }

    // チェックボックスすべてにイベントリスナーを追加。recordFeed/undoFeed
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const petId = Number(e.target.dataset.petId);
            if (e.target.checked) {
                await recordFeed(petId);
            } else {
                await undoFeed(petId);
            }
            await renderPetList();
        });
    });
}

// ヘルパー関数： M/D 形式で日付を表示
function formatDate(date) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 編集画面
function openEditModal(pet) {
    const modal = document.getElementById('edit-modal');
    const modalContent = modal.querySelector('.modal-content');

    modalContent.innerHTML = ''; // 既存内容をクリア

    const form = document.createElement('form');
    form.innerHTML = `
        <h2>名前を編集</h2>
        <label>
            名前:<input type="text" name="name" value="${pet.name}" required>
        </label><br>
        <label>
            種類:<input type="text" name="type" value="${pet.type}" required>
        </label><br>
        <button type="submit">これでOK</button>
    `;

    // フォーム送信でDB更新
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.elements['name'].value;
        const type = form.elements['type'].value;

        await db.pets.update(pet.id, { name, type });
        closeModal();
        await renderPetList();
    });

    modalContent.appendChild(form);
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('edit-modal');
    modal.style.display = 'none';
}

// 日付が変わった時には再描画
function scheduleMidnightRefresh() {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0); // 翌日の0:00:00.000

    const timeout = nextMidnight - now;

    setTimeout(() => {
        renderPetList(); // 日付が変わったら再描画
        scheduleMidnightRefresh(); // 次回のタイミングもスケジュール
    }, timeout);
}

// Webアプリ起動
async function startApp() {
    await initializeOnce();
    await renderPetList();
}
startApp();
scheduleMidnightRefresh();