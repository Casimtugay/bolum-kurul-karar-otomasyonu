import {
  apiFetch,
  getStoredUnit,
  ApiError,
} from '../api/client';

const utc = (value) => {
  if (!value || typeof value !== 'string') return null;

  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value)
    ? value
    : `${value}Z`;
};

const trDate = (value) => {
  if (typeof value !== 'string') return '';

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);

  return match
    ? `${match[3]}.${match[2]}.${match[1]}`
    : '';
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const requireArray = (value) => {
  if (!Array.isArray(value)) {
    throw new ApiError(
      'Sunucudan geçerli liste bilgisi alınamadı.',
      502
    );
  }

  return value;
};

const decisionPath = (id) =>
  `/api/decisions/${encodeURIComponent(id)}`;

function mapListItem(d) {
  return {
    id: d.id,
    meetingYear: d.meetingYear,
    meetingNo: d.meetingNo,
    decisionNo: d.decisionNo,
    no: `${d.meetingYear}/${d.meetingNo}`,
    konu: d.agenda || '',
    tarih: trDate(d.meetingDate),
    meetingDate: d.meetingDate,
    status: d.status,
    oySonucu: d.voteOutcome || '',
    signedAt: utc(d.signedAt),
    cancelledAt: utc(d.cancelledAt),
    eligible: d.eligible,
    signedCount: d.signedCount,
    kabulCount: d.kabulCount ?? 0,
    retCount: d.retCount ?? 0,
    myVotePending: Boolean(d.myVotePending),
    rowVersion: d.rowVersion || null,
  };
}

function mapDecision(d, unitCode) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    throw new ApiError(
      'Sunucudan geçerli karar bilgisi alınamadı.',
      502
    );
  }

  return {
    id: d.id,
    meetingId: d.meetingId ?? null,
    attendanceManagedByMeeting: d.meetingId != null,
    meetingRowVersion: d.meetingRowVersion ?? null,
    meetingAttendanceLocked: d.meetingAttendanceLocked === true,
    unitId:
      d.unitCode ??
      d.academicUnit?.code ??
      unitCode ??
      null,

    meetingYear: d.meetingYear,
    meetingNo: d.meetingNo,
    decisionNo: d.decisionNo,
    no: `${d.meetingYear}/${d.meetingNo}`,

    konu: d.agenda || '',
    gundem: d.agenda || '',
    ilgi: d.reference || '',
    karar: d.content || '',
    ekler: d.attachmentsNote || '',

    tarih: trDate(d.meetingDate),
    meetingDate: d.meetingDate,

    tableColumns: parseArray(d.tableColumnsJson),
    tableRows: parseArray(d.tableRowsJson),

    status: d.status,
    oySonucu: d.voteOutcome || '',
    submittedAt: utc(d.submittedAt),
    createdAt: utc(d.createdAt),
    updatedAt: utc(d.updatedAt),
    signedAt: utc(d.signedAt),
    sealedAt: utc(d.sealedAt),

    documentHash: d.documentHash || null,
    verificationCode: d.verificationCode || null,
    finalPdfHash: d.finalPdfHash || null,
    finalPdfSealedAt: utc(d.finalPdfSealedAt),
    rowVersion: d.rowVersion || null,

    cancelledAt: utc(d.cancelledAt),
    cancelledByName: d.cancelledByName || '',
    cancellationReason: d.cancellationReason || '',

    sourceDecisionId: d.sourceDecisionId ?? null,
    reconsiderationDecisionId:
      d.reconsiderationDecisionId ?? null,

    canCancel: Boolean(d.canCancel),
    canReconsider: Boolean(d.canReconsider),
    eligibility: d.eligibility || null,

    attachmentsLoaded: Array.isArray(d.attachments),

    attachments: (
      Array.isArray(d.attachments) ? d.attachments : []
    ).map((a) => ({
      id: a.id,
      name: a.name || '',
      size: a.size,
      contentType: a.contentType,
      uploadedAt: utc(a.uploadedAt),
      sha256: a.sha256 || '',
    })),

    result: d.result
      ? {
          eligible: d.result.eligible,
          kabul: d.result.kabul,
          ret: d.result.ret,
          complete: d.result.complete,
          accepted: d.result.accepted,
          pending: d.result.pending,
          tieBrokenByChair: d.result.tieBrokenByChair,
        }
      : null,

    participants: (
      Array.isArray(d.participants) ? d.participants : []
    ).map((p) => ({
      memberId: p.userId,
      userId: p.userId,
      name: p.displayName || '',
      title: p.duty || '',
      isChair: Boolean(p.isChair),
      attendance: p.attendance,
      vote: p.vote ?? null,
      voteReason: p.voteReason || '',
      votedAt: utc(p.votedAt),
      signedAt: utc(p.signedAt),
      preSignedAt: utc(p.preSignedAt),
      signatureRef: p.signatureRef || null,
    })),
  };
}

async function requestDecision(path, options) {
  const unitCode = getStoredUnit()?.code;
  const data = await apiFetch(path, options);

  return mapDecision(data, unitCode);
}

async function requestPage(path, options = {}) {
  const {
    page = 1,
    pageSize = 25,
    search = '',
    status = '',
    from = '',
    to = '',
    snapshotId = null,
    signal,
  } = options;

  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);
  if (from) query.set('from', from);
  if (to) query.set('to', to);

  if (snapshotId !== null) {
    query.set('snapshotId', String(snapshotId));
  }

  const data = await apiFetch(
    `${path}?${query.toString()}`,
    { signal }
  );

  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isInteger(data.total) ||
    data.total < 0 ||
    !Number.isInteger(data.page) ||
    data.page < 1 ||
    !Number.isInteger(data.pageSize) ||
    data.pageSize < 1 ||
    !Number.isInteger(data.totalPages) ||
    data.totalPages < 1 ||
    !Number.isInteger(data.snapshotId) ||
    data.snapshotId < 0
  ) {
    throw new ApiError(
      'Sunucudan geçerli sayfalama bilgisi alınamadı.',
      502
    );
  }

  return {
    items: data.items.map(mapListItem),
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    totalPages: data.totalPages,
    snapshotId: data.snapshotId,
  };
}

// Artık dizi değil, { items, total, page, ... } döndürür.
export function getDecisions(options = {}) {
  return requestPage('/api/decisions', options);
}

export function getArchive(options = {}) {
  // Eski string durum parametresini de kabul eder.
  const normalized =
    typeof options === 'string'
      ? { status: options }
      : options;

  return requestPage('/api/decisions/archive', normalized);
}

export function getDecision(id) {
  return requestDecision(decisionPath(id));
}

export async function getUnitMembers() {
  return requireArray(
    await apiFetch('/api/units/current/members')
  );
}

export function createDecision(payload) {
  return requestDecision('/api/decisions', {
    method: 'POST',
    body: payload,
  });
}

export function updateDecision(id, payload) {
  return requestDecision(decisionPath(id), {
    method: 'PUT',
    body: payload,
  });
}

export function deleteDecision(id, rowVersion) {
  return apiFetch(decisionPath(id), {
    method: 'DELETE',
    body: { rowVersion },
  });
}

// "Oylamaya Sun": karar Oylamada olur, metni/ekleri kilitlenir, üyelere bildirim gider.
export function submitDecision(id, rowVersion) {
  return requestDecision(`${decisionPath(id)}/submit`, {
    method: 'POST',
    body: { rowVersion },
  });
}

export function cancelDecision(id, reason, rowVersion) {
  return requestDecision(`${decisionPath(id)}/cancel`, {
    method: 'POST',
    body: { reason, rowVersion },
  });
}

export function reconsiderDecision(id, payload) {
  return requestDecision(`${decisionPath(id)}/reconsider`, {
    method: 'POST',
    body: payload,
  });
}

export function setAttendance(
  id,
  userId,
  attendance,
  rowVersion
) {
  return requestDecision(`${decisionPath(id)}/attendance`, {
    method: 'PUT',
    body: { userId, attendance, rowVersion },
  });
}

export function castVote(
  id,
  vote,
  reason = '',
  rowVersion
) {
  return requestDecision(`${decisionPath(id)}/vote`, {
    method: 'POST',
    body: {
      vote,
      reason: vote === 'Ret' ? reason.trim() : null,
      rowVersion,
    },
  });
}

export function signDecision(id, pin) {
  return requestDecision(`${decisionPath(id)}/sign`, {
    method: 'POST',
    body: { pin },
  });
}

export function verifyDecision(id) {
  return apiFetch(`${decisionPath(id)}/verify`);
}

export async function getPendingSignerEmails(id) {
  const list = requireArray(
    await apiFetch(`${decisionPath(id)}/pending-signers`)
  );

  return [
    ...new Set(
      list
        .map((item) =>
          typeof item.email === 'string'
            ? item.email.trim()
            : ''
        )
        .filter(Boolean)
    ),
  ];
}

export function computeResult(value = []) {
  const decision =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : null;

  const participants = Array.isArray(value)
    ? value
    : Array.isArray(decision?.participants)
      ? decision.participants
      : [];

  const server = decision?.result;

  if (server) {
    return {
      total: participants.length,
      eligible: server.eligible,
      absent: Math.max(
        0,
        participants.length - server.eligible
      ),
      kabul: server.kabul,
      ret: server.ret,
      pending: server.pending,
      complete:
        server.complete ??
        (server.eligible > 0 && server.pending === 0),
      accepted: ['ImzaBekliyor', 'Imzalandi'].includes(
        decision.status
      ),
      tie: Boolean(server.tieBrokenByChair),
      oySonucu: decision.oySonucu || '',
    };
  }

  const eligible = participants.filter(
    (p) => p.attendance === 'Katilir'
  );

  const kabul = eligible.filter(
    (p) => p.vote === 'Kabul'
  ).length;

  const ret = eligible.filter(
    (p) => p.vote === 'Ret'
  ).length;

  const pending = eligible.length - kabul - ret;
  const complete = eligible.length > 0 && pending === 0;
  const tie = complete && kabul === ret;

  const accepted =
    complete &&
    (kabul > ret ||
      (tie &&
        eligible.find((p) => p.isChair)?.vote === 'Kabul'));

  return {
    total: participants.length,
    eligible: eligible.length,
    absent: participants.length - eligible.length,
    kabul,
    ret,
    pending,
    complete,
    accepted,
    tie,
    oySonucu: complete
      ? kabul === 0 || ret === 0
        ? 'oy birliğiyle'
        : 'oy çokluğuyla'
      : '',
  };
}

const meetingPath = (id) =>
  `/api/meetings/${encodeURIComponent(id)}`;

function requireMeeting(data) {
  if (
    !data ||
    !Number.isInteger(data.id) ||
    data.id <= 0 ||
    !Array.isArray(data.participants) ||
    typeof data.rowVersion !== 'string'
  ) {
    throw new ApiError(
      'Sunucudan geçerli toplantı bilgisi alınamadı.',
      502
    );
  }

  return data;
}

export async function getMeetings({
  page = 1,
  pageSize = 25,
  year = '',
  signal,
} = {}) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (year !== '' && year != null) {
    query.set('year', String(year));
  }

  const data = await apiFetch(
    `/api/meetings?${query.toString()}`,
    { signal }
  );

  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isInteger(data.total) ||
    data.total < 0 ||
    !Number.isInteger(data.page) ||
    data.page < 1 ||
    !Number.isInteger(data.totalPages) ||
    data.totalPages < 1
  ) {
    throw new ApiError(
      'Toplantı listesi alınamadı.',
      502
    );
  }

  return data;
}

export async function getMeeting(id, { signal } = {}) {
  return requireMeeting(
    await apiFetch(meetingPath(id), { signal })
  );
}

export async function createMeeting(payload) {
  return requireMeeting(
    await apiFetch('/api/meetings', {
      method: 'POST',
      body: payload,
    })
  );
}

export async function setMeetingAttendance(
  id,
  userId,
  attendance,
  rowVersion
) {
  return requireMeeting(
    await apiFetch(`${meetingPath(id)}/attendance`, {
      method: 'PUT',
      body: { userId, attendance, rowVersion },
    })
  );
}