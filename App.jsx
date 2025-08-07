import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Tesseract from 'tesseract.js'

// Supabase credentials from .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)
  const [extractedIds, setExtractedIds] = useState([])

  // Regex to find 18-digit Pallet IDs
  const extractPalletIdsFromText = (text) => {
    const regex = /\b\d{18}\b/g
    const matches = text.match(regex)
    return matches ? [...new Set(matches)] : []
  }

  // Called when a file is selected
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setLoading(true)

    try {
      // Run OCR
      const {
        data: { text }
      } = await Tesseract.recognize(selectedFile, 'eng', {
        logger: (m) => console.log(m) // optional: shows progress
      })

      // Extract Pallet IDs from OCR text
      const palletIds = extractPalletIdsFromText(text)
      setExtractedIds(palletIds)

      // Lookup each in Supabase
      const resultsMap = {}
      for (const id of palletIds) {
        const { data, error } = await supabase
          .from('NDAs')
          .select('document_name, page_number')
          .eq('pallet_id', id)

        resultsMap[id] = error ? { error: error.message } : data
      }

      setResults(resultsMap)
    } catch (err) {
      console.error('OCR error:', err)
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Pallet ID NDA Lookup (OCR)</h2>

      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={loading}
        style={{ marginBottom: '1rem' }}
      />

      {loading && <p>🔍 Scanning file and matching pallet IDs...</p>}

      {!loading && extractedIds.length > 0 && (
        <div>
          <h4>Extracted Pallet IDs:</h4>
          <ul>
            {extractedIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        {Object.keys(results).map((id) => (
          <div key={id} style={{ marginBottom: '1rem' }}>
            <strong>{id}</strong>
            <ul>
              {results[id].error ? (
                <li style={{ color: 'red' }}>{results[id].error}</li>
              ) : results[id].length === 0 ? (
                <li style={{ color: 'red' }}>❌ No match found</li>
              ) : (
                results[id].map((entry, idx) => (
                  <li key={idx}>
                    📄 {entry.document_name} - 📄 Page {entry.page_number}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
