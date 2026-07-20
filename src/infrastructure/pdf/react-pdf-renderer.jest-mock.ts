import React from 'react'

const node = ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)

export const Font = { register: jest.fn() }
export const renderToBuffer = jest.fn().mockResolvedValue(Buffer.from('%PDF-jest-renderer'))
export const Document = node
export const Page = node
export const Text = node
export const View = node
export const StyleSheet = { create: <T>(styles: T) => styles }
