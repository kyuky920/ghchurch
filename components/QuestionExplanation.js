export default function QuestionExplanation({ text }) {
  if (typeof text !== 'string' || !text.trim()) return null
  const blocks = text.trim().split(/\n\s*\n/).map(block => block.split('\n').map(line => line.trim()).filter(Boolean))
  const bullet = line => /^[•·-]\s+/.test(line)
  const groups = blocks.map(lines => {
    const heading = !bullet(lines[0]) && lines.slice(1).length && lines.slice(1).every(bullet) ? lines[0] : ''
    const items = heading ? lines.slice(1) : lines
    return { heading, items, list: items.every(bullet) }
  })
  const reading = { lineHeight:1.85, wordBreak:'keep-all', overflowWrap:'anywhere' }
  if (!groups.some(group => group.list)) return <p data-question-explanation style={{...reading,whiteSpace:'pre-line',margin:'12px 0 0'}}>{text}</p>
  return <div data-question-explanation style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',gap:12,marginTop:12}}>
    {groups.map((group,index) => <section key={index} aria-label={group.heading || undefined} style={{...reading,background:'#fff',border:'1px solid #e8dcc8',borderRadius:12,padding:'14px 16px',minWidth:0}}>
      {group.heading && <p style={{fontWeight:700,color:'#6b5040',margin:'0 0 10px'}}>{group.heading}</p>}
      {group.list ? <ul style={{margin:0,paddingLeft:20,display:'flex',flexDirection:'column',gap:10}}>
        {group.items.map((line,i) => <li key={i} style={{paddingLeft:2}}>{line.replace(/^[•·-]\s+/, '')}</li>)}
      </ul> : <p style={{margin:0,whiteSpace:'pre-line'}}>{group.items.join('\n')}</p>}
    </section>)}
  </div>
}
