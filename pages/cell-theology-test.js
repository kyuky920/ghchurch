import { useMemo, useState } from 'react'
import Head from 'next/head'

const STUDY_DATA = {
  week: '2026-05-17',
  topic: '루이스 벌코프 조직신학 · 신론',
  subtitle: '하나님의 본질, 이름(명칭), 속성',
  services: {
    morning: {
      label: '주일 오전',
      title: '하나님의 본질과 자존성',
      bible: ['출 3:14', '신 6:4', '요 4:24', '행 17:24-25'],
      confession: ['웨스트민스터 신앙고백서 2장 1항', '웨스트민스터 소요리문답 4문'],
      summary: [
        '하나님은 스스로 계시는 분으로서 어떤 피조물에도 의존하지 않으십니다.',
        '하나님의 본질은 영이시며, 단순하시고, 변하지 않으시며, 영원하십니다.',
        '하나님을 안다는 것은 단순한 정보 습득이 아니라 경외와 순종으로 이어져야 합니다.',
      ],
      sections: [
        {
          title: '오프닝',
          description: '오늘 본문과 공부 주제를 들으시며 가장 먼저 떠오른 질문이나 느낌을 나눠주세요.',
          questions: [
            '오늘 예배와 말씀을 통해 하나님에 대해 새롭게 생각하게 된 부분이 있으셨나요?',
          ],
        },
        {
          title: '본문 관찰',
          description: '본문이 하나님을 어떻게 계시하는지 관찰합니다.',
          questions: [
            '출애굽기 3:14의 “나는 스스로 있는 자”라는 선언은 하나님과 피조물의 차이를 어떻게 보여주나요?',
            '요한복음 4:24의 “하나님은 영이시니”라는 말씀은 우리의 예배 태도에 어떤 기준을 제시하나요?',
          ],
        },
        {
          title: '교리 이해',
          description: '벌코프 신학의 핵심 개념을 성경과 함께 정리합니다.',
          questions: [
            '하나님의 자존성(aseity)은 왜 신자의 확신과 기도의 토대가 될 수 있나요?',
            '하나님의 불변성이 “하나님은 멀고 차갑다”는 뜻이 아닌 이유를 성경적으로 설명해 볼 수 있을까요?',
          ],
        },
        {
          title: '적용과 기도',
          description: '하나님 인식이 일상의 경건과 순종으로 연결되도록 적용합니다.',
          questions: [
            '내 삶에서 하나님보다 더 의지하고 있는 “사실상의 신”이 있다면 무엇인가요?',
            '이번 주에 하나님의 자존성과 신실하심을 기억하며 실천할 한 가지를 정해볼까요?',
          ],
        },
      ],
    },
    evening: {
      label: '주일 오후',
      title: '하나님의 이름과 전달적/비전달적 속성',
      bible: ['시 9:10', '마 6:9', '벧전 1:15-16', '요일 4:8'],
      confession: ['하이델베르크 요리문답 122문', '웨스트민스터 대요리문답 101문'],
      summary: [
        '하나님의 이름은 단순한 호칭이 아니라 하나님 자신을 알게 하는 계시입니다.',
        '비전달적 속성(자존성, 불변성, 무한성)과 전달적 속성(거룩, 사랑, 의, 선)은 분리되지 않고 하나님의 단순성 안에서 통일됩니다.',
        '하나님의 이름을 부르는 삶은 그분의 성품을 닮아가는 순종의 삶으로 증명됩니다.',
      ],
      sections: [
        {
          title: '오프닝',
          description: '하나님의 이름을 부르며 살고 있는지 돌아봅니다.',
          questions: [
            '최근 기도에서 하나님의 이름을 의식적으로 부르며 나아간 경험이 있으신가요?',
          ],
        },
        {
          title: '본문 관찰',
          description: '성경이 하나님의 이름과 거룩을 어떻게 연결하는지 살핍니다.',
          questions: [
            '마태복음 6:9 “이름이 거룩히 여김을 받으시오며”는 우리의 일상 언어와 태도에 어떤 변화를 요구하나요?',
            '시편 9:10은 하나님의 이름을 아는 것과 신뢰하는 것을 어떻게 연결하나요?',
          ],
        },
        {
          title: '교리 이해',
          description: '속성론을 단순 분류가 아니라 복음적 통전성으로 이해합니다.',
          questions: [
            '하나님의 사랑과 거룩이 충돌하지 않고 십자가에서 함께 드러난다는 사실을 어떻게 설명할 수 있을까요?',
            '하나님의 속성을 “내가 원하는 하나님상”으로 선택적으로 받아들이는 위험은 무엇인가요?',
          ],
        },
        {
          title: '적용과 기도',
          description: '하나님의 이름에 합당한 삶으로 구체화합니다.',
          questions: [
            '하나님의 이름을 영화롭게 하기 위해 이번 주에 멈춰야 할 말과 시작해야 할 행동은 무엇인가요?',
            '공동체가 하나님의 거룩과 사랑을 함께 드러내기 위해 실천할 수 있는 한 가지는 무엇인가요?',
          ],
        },
      ],
    },
  },
}

const STEPS = ['오프닝', '본문 관찰', '교리 이해', '적용과 기도']

export default function CellTheologyTestPage() {
  const [service, setService] = useState('morning')
  const [step, setStep] = useState(0)
  const selected = STUDY_DATA.services[service]

  const currentSection = useMemo(() => {
    const targetTitle = STEPS[step]
    return selected.sections.find((s) => s.title === targetTitle) || selected.sections[0]
  }, [selected, step])

  async function copyCurrentSection() {
    const lines = [
      `📘 [테스트] ${STUDY_DATA.topic}`,
      `${selected.label} · ${selected.title}`,
      `주차: ${STUDY_DATA.week}`,
      '',
      `(성경본문)`,
      selected.bible.join(', '),
      '',
      `(신조/문답)`,
      selected.confession.join(', '),
      '',
      `(진행단계) ${currentSection.title}`,
      currentSection.description,
      '',
      '(질문)',
      ...currentSection.questions.map((q, i) => `${i + 1}. ${q}`),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      alert('현재 단계 내용이 복사되었습니다.')
    } catch (e) {
      alert('복사에 실패했습니다.')
    }
  }

  return (
    <>
      <Head>
        <title>셀 조직신학 테스트 · WORD &amp; LIFE</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main style={{ minHeight: '100vh', background: '#f6f3ee', padding: 20, fontFamily: "'Noto Sans KR', sans-serif", color: '#2f281f' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 28 }}>셀 조직신학 테스트 페이지</h1>
          <p style={{ margin: '0 0 16px', color: '#6d5a46' }}>
            기존 페이지와 분리된 샘플입니다. DB 저장 없이 테스트 데이터로만 동작합니다.
          </p>

          <section style={{ background: '#fff', border: '1px solid #e0d3c0', borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#8b6e4e' }}>{STUDY_DATA.subtitle}</p>
            <h2 style={{ margin: '0 0 8px', fontSize: 21 }}>{selected.title}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {['morning', 'evening'].map((key) => {
                const on = service === key
                return (
                  <button
                    key={key}
                    onClick={() => setService(key)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `1px solid ${on ? '#8b6a45' : '#d7c8b5'}`,
                      background: on ? '#f2e7d8' : '#fff',
                      color: on ? '#5f452b' : '#826f58',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {STUDY_DATA.services[key].label}
                  </button>
                )
              })}
            </div>
          </section>

          <section style={{ background: '#fff', border: '1px solid #e0d3c0', borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>(핵심요약)</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
              {selected.summary.map((line, i) => <li key={i} style={{ lineHeight: 1.8 }}>{line}</li>)}
            </ul>
          </section>

          <section style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {STEPS.map((name, idx) => (
              <button
                key={name}
                onClick={() => setStep(idx)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 999,
                  border: `1px solid ${step === idx ? '#4d7a56' : '#d7c8b5'}`,
                  background: step === idx ? '#e9f4ec' : '#fff',
                  color: step === idx ? '#2d5d37' : '#7d6b56',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {idx + 1}. {name}
              </button>
            ))}
          </section>

          <section style={{ background: '#fff', border: '1px solid #e0d3c0', borderRadius: 14, padding: 16 }}>
            <p style={{ margin: '0 0 8px', color: '#8b6e4e', fontWeight: 700 }}>(진행단계) {currentSection.title}</p>
            <p style={{ margin: '0 0 14px', lineHeight: 1.8 }}>{currentSection.description}</p>
            {currentSection.questions.map((q, i) => (
              <div key={i} style={{ border: '1px solid #eee1cf', background: '#fdfbf8', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.75 }}>{i + 1}. {q}</p>
              </div>
            ))}
            <button
              onClick={copyCurrentSection}
              style={{ marginTop: 10, width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #e0c08a', background: 'linear-gradient(135deg,#f8e5bf,#f0c77a)', color: '#5c4323', fontWeight: 700, cursor: 'pointer' }}
            >
              💬 현재 단계 카톡으로 복사하기
            </button>
          </section>
        </div>
      </main>
    </>
  )
}

