import { FONT_SCALE_OPTIONS, fontSizePx } from '../hooks/useFontScale'

export default function FontScaleControl({ fontScaleKey, setFontScaleKey, label = '글씨 크기' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
      <p style={{ margin:0, fontSize:fontSizePx(12), color:'#8b6e4e', fontWeight:700 }}>{label}</p>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {FONT_SCALE_OPTIONS.map((option) => {
          const active = option.key === fontScaleKey
          return (
            <button
              key={option.key}
              onClick={() => setFontScaleKey(option.key)}
              style={{
                border: active ? '1px solid #a0784e' : '1px solid #ddd0ba',
                background: active ? '#fdf5ec' : '#fff',
                color: active ? '#7a5a33' : '#8b6e4e',
                borderRadius: 999,
                padding: '7px 11px',
                fontSize: fontSizePx(12),
                fontWeight: 700,
                cursor: 'pointer',
                lineHeight: 1.2,
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
