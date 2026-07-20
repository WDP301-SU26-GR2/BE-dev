import { Injectable } from '@nestjs/common'
import { Font, renderToBuffer } from '@react-pdf/renderer'
import * as path from 'node:path'
import React from 'react'
import { ContractPdfDocument } from './contract-pdf.document'

export type ContractPdfData = {
  id: string
  createdAt: string
  contractType: string
  valuationAmount: number | null
  publisherOwnershipPct: number | null
  mangakaOwnershipPct: number | null
  terminationClause: string | null
  contractStart: string | null
  contractEnd: string | null
  status: string
  mangakaSignedAt: string | null
  boardSignedAt: string | null
  series: { id: string; title: string; magazine: string | null }
  mangaka: { displayName: string }
  editor: { displayName: string } | null
  boardDecision: {
    decisionType: string | null
    result: string | null
    decidedAt: string | null
    boardSession: { title: string; startTime: string }
  } | null
  conditions: Array<{
    conditionType: string
    thresholdConfig: unknown
    payoutAmount: number | null
    payoutPct: number | null
    status: string
  }>
  signatures: Array<{ displayName: string; signedAt: string }>
  versionCount: number
  executedAmendmentCount: number
  latestAmendmentAt: string | null
}

@Injectable()
export class PdfRenderService {
  private static fontsRegistered = false

  constructor() {
    if (!PdfRenderService.fontsRegistered) {
      Font.register({
        family: 'Roboto',
        fonts: [
          { src: path.join(__dirname, 'fonts', 'Roboto-Regular.ttf') },
          { src: path.join(__dirname, 'fonts', 'Roboto-Bold.ttf'), fontWeight: 700 }
        ]
      })
      PdfRenderService.fontsRegistered = true
    }
  }

  async renderContractPdf(data: ContractPdfData): Promise<Buffer> {
    // ContractPdfDocument always returns a react-pdf <Document>; renderer's public type cannot infer that from a custom component.
    return await renderToBuffer(React.createElement(ContractPdfDocument, { data }) as never)
  }
}
