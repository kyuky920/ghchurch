export function readQuestionDocument(value) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return null; } }
  return value;
}

export function getSharingSupport(value) {
  const document = readQuestionDocument(value);
  const meta = document && !Array.isArray(document) ? document.meta || {} : {};
  return {
    opening: meta.opening_question?.question ? meta.opening_question : null,
    practices: Array.isArray(meta.practice_options) ? meta.practice_options : [],
    closingPrayer: typeof meta.closing_prayer === 'string' ? meta.closing_prayer : '',
    version: meta.content_version || '',
  };
}

export function requiresContentReview(value) {
  const doc = readQuestionDocument(value);
  const meta = doc && !Array.isArray(doc) ? doc.meta : null;
  if (meta?.content_version !== 'youth-sharing-v2' && !meta?.revision_review) return false;
  if (meta.human_review?.confirmed_at) return false;
  const publication = meta.publication_review;
  const uncertain = meta.transcript_review?.corrections?.filter(c => c.status === 'needs_confirmation') || [];
  // Explicit publication authorization and a recorded source-only editorial review
  // do not certify the audio. Every unresolved reading must be accounted for.
  if (publication?.status === 'approved' && publication.authorized_by === 'user_publish_request'
    && publication.basis === 'source_text_and_scripture' && publication.audio_verified === false
    && Number.isFinite(Date.parse(publication.reviewed_at)) && meta.quality_review?.status === 'passed'
    && !meta.quality_review?.issues?.some(issue => issue.severity === 'blocking')
    && uncertain.every(c => publication.excluded_ambiguous_readings?.some(item => item.paragraph_id === c.paragraph_id && item.original === c.original && item.treatment === 'ambiguous_reading_not_used' && item.note))) return false;
  return meta.requires_review === true || meta.quality_review?.status !== 'passed'
    || !!meta.transcript_review?.corrections?.some((c) => c.status === 'needs_confirmation');
}

export function buildEditedQuestionDocument(original, edited) {
  const previous = readQuestionDocument(original);
  // Regroup the edited list and retain audit/support data; stale groups must not override edits.
  if (!previous || Array.isArray(previous)) return edited;
  const sections = [];
  for (const question of edited) {
    const title = question.section_title || '나눔 질문';
    let section = sections.find((s) => s.section_title === title);
    if (!section) {
      section = { section_title: title, summary_anchor: previous.sections?.find((s) => s.section_title === title)?.summary_anchor || '', questions: [] };
      sections.push(section);
    }
    section.questions.push({ ...question });
  }
  const meta = { ...(previous.meta || {}) };
  if (meta.content_version === 'youth-sharing-v2' || meta.revision_review) {
    // An earlier AI/human decision no longer proves the edited wording was checked.
    delete meta.human_review;
    delete meta.publication_review;
    meta.requires_review = true;
    meta.quality_review = { status: 'needs_review', summary: '나눔자료가 편집되었습니다. 저장한 문안을 확인한 뒤 공개해 주세요.', issues: [] };
  }
  return { sections, flat: sections.flatMap((s) => s.questions), meta };
}

export function sharingOpeningText(value) {
  const { opening } = getSharingSupport(value);
  return opening ? `[마음 열기]\n${opening.question}\n${opening.explanation || ''}`.trim() : '';
}

export function sharingClosingText(value) {
  const { practices, closingPrayer } = getSharingSupport(value);
  const lines = [];
  if (practices.length) {
    lines.push('[이번 주 실천: 하나만 선택하거나 직접 정해 보세요]');
    practices.forEach((p) => lines.push(`- ${p.text} (${p.origin === 'sermon' ? '설교에서 제시한 실천' : '말씀에 따라 제안한 예시'})`));
  }
  if (closingPrayer) lines.push('', '[마무리 기도 초안]', closingPrayer);
  return lines.join('\n').trim();
}

// Also enforced on the server, so partial summary edits cannot reuse an older review.
export function prepareContentReviewForSave(previousValue, nextValue, confirmed = false, now = new Date().toISOString()) {
  const previous = readQuestionDocument(previousValue);
  const next = readQuestionDocument(nextValue);
  if (previous?.meta?.content_version !== 'youth-sharing-v2' && next?.meta?.content_version !== 'youth-sharing-v2' && !previous?.meta?.revision_review && !next?.meta?.revision_review) return next;
  // Older editors may send a flat array: preserve the existing support and audit envelope.
  const document = Array.isArray(next) ? buildEditedQuestionDocument(previous, next) : next;
  const meta = { ...(document?.meta || previous?.meta || {}) };
  delete meta.human_review;
  delete meta.publication_review;
  meta.requires_review = !confirmed;
  if (confirmed) meta.human_review = { confirmed_at: now };
  else meta.quality_review = { status:'needs_review', summary:'자료가 편집되어 원문과의 재확인이 필요합니다.', issues:[] };
  return { ...document, meta };
}
