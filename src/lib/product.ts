export const productMetadata = {
  parentBrand: 'State of Stick',
  productName: 'State of Stick Golf',
  physicalLayer: 'StickLink',
  intelligenceLayer: 'State of Stick Golf Intelligence',
  provisionalTagline: 'Every round becomes more valuable.',
} as const;

export type ProductMetadata = typeof productMetadata;
