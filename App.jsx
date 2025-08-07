import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Tesseract from 'tesseract.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min?url'

GlobalWorkerOptions.workerSrc = pdfWorker

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function App() {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [inserted, setInserted] = useState([])

  const extractPalletIdsFromText = (text) => {
    const regex = /\b\d{18}\b/g
    const matches = text.match(regex)
    return matches ? [...new Set(matches)] : []
  }

  const handlePDFUpload = async (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setLoading(true)
    setInserted([])

    try {
      const fileReader = new FileReader()
      fileReader.onload = async () => {
        const typedArray = new Uint8Array(fileReader.result)
        const pdf = await getDocument({ data: typedArray }).promise

        const insertedRows = []
        const fileName = selectedFile.name

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2 })
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')

          canvas.height = viewport.height
          canvas.width = viewport.width

          await page.render({ canvasContext: context, viewport }).promise
          const dataUrl = canvas.toDataURL()

          const {
            data: { text }
          } = await Tesseract.recognize(dataUrl, 'eng')

          const palletIds = extractPalletIdsFromText(text)

          for (const id of palletIds) {
            const { error } = await supabase.from('NDAs').insert([
              {
                pallet_id: id,
                document_name: fileName,
                page_number: i
              }
            ])

            if (!error) {
              insertedRows.push({ id, page: i })
            } else {
              console.error('Insert error:', error.message)
            }
          }
        }

        setInserted(insertedRows)
      }

      fileReader.readAsArrayBuffer(selectedFile)
    } catch (err) {
      console.error('OCR or PDF error:', err)
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>📥 Upload Inspection PDF & Insert Pallet IDs</h2>

      <input
        type="file"
        accept=".pdf"
        onChange={handlePDFUpload}
        disabled={loading}
      />

      {loading && <p>🔍 Scanning PDF and uploading to Supabase...</p>}

      {!loading && inserted.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h4>✅ Inserted Pallet IDs:</h4>
          <ul>
            {inserted.map((row, index) => (
              <li key={index}>
                {row.id} — Page {row.page}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
