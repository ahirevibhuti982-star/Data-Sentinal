/**
 * api.js
 * Thin axios wrappers for every backend endpoint.
 * All network errors bubble up as Error objects with a .message property.
 */
import axios from 'axios'

const http = axios.create({
  baseURL: 'https://data-sentinel.onrender.com/api',
  timeout: 30_000,
})

export async function uploadScan(file) {
  const form = new FormData()
  form.append('file', file)
  const { data } = await http.post('/scans/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function listScans() {
  const { data } = await http.get('/scans')
  return data
}

export async function getScan(id) {
  const { data } = await http.get(`/scans/${id}`)
  return data
}

export async function healthCheck() {
  const { data } = await http.get('/health')
  return data
}
