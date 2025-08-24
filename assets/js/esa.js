// データベースを初期化
const db = new Dexie('esaDB');

db.version(1).stores({
    pets: '++id, name, type, image',
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

// ペット1匹の表示要素を作成
function createPetElement(pet, feeds, pastDates, today) {
    // 今日餌やりしたか確認
    const todayFeed = feeds.find(f => f.petId === pet.id && isSameDay(new Date(f.date), today));

    // メインコンテナ
    const div = document.createElement('div');
    div.classList.add('pet-entry');
    div.dataset.petId = pet.id;

    // 画像がある場合
    if (pet.image) {
        div.classList.add('has-image');
        const img = document.createElement('img');
        img.src = pet.image;
        img.classList.add('pet-image');
        img.width = 64;
        img.height = 64;
        img.alt = `${pet.name}のアイコン`;
        div.appendChild(img);
    } else {
        div.classList.add('no-image');
    }

    // 内部コンテンツ用のラッパー
    const content = document.createElement('div');
    content.classList.add('pet-entry-content');

    // 編集ボタン（右上固定）
    const editBtn = document.createElement('button');
    editBtn.classList.add('editPetBtn');
    editBtn.textContent = '✏️';
    editBtn.dataset.petId = pet.id;
    content.appendChild(editBtn);

    // 名前・タイプ・チェックボックス
    const info = document.createElement('div');
    info.classList.add('pet-main');
    info.innerHTML = `
        <span class="pet-type">${pet.type}</span> / <span class="pet-name">${pet.name}</span>
    `;
    content.appendChild(info);

    div.appendChild(content);

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
            const m = date.getMonth() + 1;
            const d = date.getDate();
            dateSpan.textContent = `${m}/${d}`;
            dateSpan.classList.add('date-label');

            wrapper.appendChild(checkbox);
            wrapper.appendChild(dateSpan);
            wrapper.classList.add('is-today');
        } else {
            const span = document.createElement('span');
            if (feed) {
                const m = date.getMonth() + 1;
                const d = date.getDate();
                span.textContent = `☑️${m}/${d}`;
                span.classList.add('has-feed');
            } else {
                span.textContent = '・';
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

    modalContent.innerHTML = ''; // 既存内容をクリア

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
        <button type="button" id="cancel-edit-btn">キャンセル</button>
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

        await db.pets.update(pet.id, updatedFields);
        closeModal();
        await updatePetElement(pet.id);
    });

    // キャンセル → モーダルを閉じるだけ
    form.querySelector('#cancel-edit-btn').addEventListener('click', () => {
        closeModal();
    });

    modalContent.appendChild(form);
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
            <label>
                アイコン画像(32x32): <input type="file" name="image" accept="image/*">
            </label><br>
            <div id="current-image-preview" style="margin: 8px 0;">（画像なし）</div>
            <button type="button" id="delete-image-btn">画像を削除</button><br><br>
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

        const newPet = { name, type };
        if (newImage) {
            newPet.image = newImage;
        }

        const petId = await db.pets.add(newPet);
        closeModal();

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
        container.appendChild(newElement);
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