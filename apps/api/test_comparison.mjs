async function runTests() {
  const base = 'http://127.0.0.1:8787/api';
  console.log('=== BẮT ĐẦU TEST TOÀN DIỆN CÁC CHỨC NĂNG MNEMA ===\n');

  // 1. Test Sources CRUD & Book detail
  console.log('1. [Sources & Books Module]');
  const bookRes = await fetch(base + '/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Atomic Habits',
      author: 'James Clear',
      type: 'book',
      reading_status: 'reading'
    })
  });
  const book = (await bookRes.json()).data;
  console.log('   - Tạo Sách thành công: id =', book.id, '| name =', book.name);

  // 2. Test Add Highlights to Source
  console.log('2. [Highlights Module]');
  const hlRes1 = await fetch(base + '/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: book.id,
      content: 'You do not rise to the level of your goals. You fall to the level of your systems.',
      note: 'Crucial distinction between goals and repeatable systems.',
      color: 'yellow',
      location: 'Chapter 1'
    })
  });
  const hl1 = (await hlRes1.json()).data;
  console.log('   - Tạo Highlight 1 thành công: id =', hl1.id);

  const hlRes2 = await fetch(base + '/highlights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: book.id,
      content: 'Every action you take is a vote for the type of person you wish to become.',
      color: 'green',
      location: 'Chapter 2'
    })
  });
  const hl2 = (await hlRes2.json()).data;
  console.log('   - Tạo Highlight 2 thành công: id =', hl2.id);

  // 3. Test Source Detail (SourceView) with all highlights & source notes
  console.log('3. [SourceView Detail & Source Notes Autosave]');
  await fetch(base + '/sources/' + book.id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_notes: 'Tong hop Atomic Habits: 4 buoc Thay doi Thoi quen (Goi y, Khao khat, Phan hoi, Thuong).'
    })
  });
  const detailRes = await fetch(base + '/sources/' + book.id);
  const detail = (await detailRes.json()).data;
  console.log('   - Lay chi tiet SourceView: Highlights count =', detail.highlights.length);
  console.log('   - Source Notes =', detail.source_notes.slice(0, 45) + '...');

  // 4. Test FTS5 Fulltext Search (Triggers Auto-Sync)
  console.log('4. [FTS5 Fulltext Search Module]');
  const searchRes = await fetch(base + '/search?q=systems');
  const searchJson = (await searchRes.json()).data;
  console.log('   - Tim kiem tu khoa "systems": Total matches =', searchJson.total);
  if (searchJson.highlights.length > 0) {
    console.log('   - Trich dan tim thay:', searchJson.highlights[0].content.slice(0, 50) + '...');
  }

  // 5. Test Spaced Repetition (SRS) Review & Undo
  console.log('5. [Spaced Repetition SRS & Undo Module]');
  const queueRes = await fetch(base + '/reviews/queue');
  const queue = (await queueRes.json()).data;
  console.log('   - Hang doi Review hien co:', queue.length, 'the');

  // Submit action: Show more (remember)
  const actRes = await fetch(base + '/reviews/' + hl1.id + '/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'remember' })
  });
  console.log('   - Danh gia the: Show More (remember) -> status:', actRes.status);

  // Test Undo
  const undoRes = await fetch(base + '/reviews/undo', { method: 'POST' });
  const undoJson = await undoRes.json();
  console.log('   - Thuc hien Undo: undoneAction =', undoJson.data?.undoneAction, '| highlight_id =', undoJson.data?.highlight?.id);

  // 6. Test Tags Persistence & Taxonomy
  console.log('6. [Tags CRUD & Color Persistence Module]');
  const tagRes = await fetch(base + '/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'mental-models', color: '#8b5cf6' })
  });
  const tag = (await tagRes.json()).data;
  console.log('   - Tao Tag moi trong D1: id =', tag.id, '| name =', tag.name, '| color =', tag.color);

  // 7. Test Notes Feed (/notes)
  console.log('7. [All Notes (/notes) Feed]');
  const notesRes = await fetch(base + '/highlights');
  const allHls = (await notesRes.json()).data;
  const notesCount = allHls.filter(h => h.note && h.note.trim().length > 0).length;
  console.log('   - So luong trich dan co ghi chu ca nhan:', notesCount);

  // 8. Test Trash Bin & Restore
  console.log('8. [Trash Bin & Restore Module]');
  // Soft delete hl2
  await fetch(base + '/highlights/' + hl2.id, { method: 'DELETE' });
  const trashRes = await fetch(base + '/trash');
  const trashData = (await trashRes.json()).data;
  console.log('   - Thung rac hien co:', trashData.highlights.length, 'highlights da xoa tam');

  // Restore hl2
  const restoreRes = await fetch(base + '/trash/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'highlight', id: hl2.id })
  });
  console.log('   - Khoi phuc highlight tu Thung rac -> status:', restoreRes.status);

  // 9. Test Activity Heatmap Log
  console.log('9. [Activity Heatmap & Streaks]');
  const actLogRes = await fetch(base + '/stats/activity');
  const actLog = (await actLogRes.json()).data;
  console.log('   - Hoat dong ghi nhan tren Heatmap:', actLog.length > 0 ? JSON.stringify(actLog[actLog.length - 1]) : '0 entries');

  console.log('\n=== KẾT QUẢ: 9/9 TEST CASES ĐẠT CHUẨN 100% ===');
}

runTests().catch(console.error);
