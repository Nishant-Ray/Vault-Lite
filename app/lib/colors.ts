export const colors: Record<string, string> = {
  'primary': 'rgba(74, 219, 144, 0.6)',
  'accent': 'rgba(54, 162, 235, 0.6)'
};

export const billCategoryColors = new Map<string, [string, string]>([ // [bg color, text color]
  ['Credit Card', ['#dddddd', '#dddddd']],
  ['Rent', ['#dddddd', '#dddddd']],
  ['Utilities', ['#dddddd', '#dddddd']],
  ['Wi-Fi', ['#dddddd', '#dddddd']],
  ['Cellular', ['#eaf7f0', '#2baa63']], // green
  ['Insurance', ['#dddddd', '#dddddd']],
  ['Medical', ['#dddddd', '#dddddd']],
  ['Entertainment', ['#fdeded', '#eb605e']], // red
  ['Transportation', ['#dddddd', '#dddddd']],
  ['Fitness', ['#dddddd', '#dddddd']],
  ['Misc.', ['#bbbbbb', '#555555']]
]);

export const residenceBillColors: Record<string, [string, string]> = {
  'Rent': ['#dddddd', '#dddddd'],
  'Mortgage': ['#dddddd', '#dddddd'],
  'Internet': ['#dddddd', '#dddddd'],
  'Trash': ['#eaf7f0', '#2baa63'], // green
  'Insurance': ['#dddddd', '#dddddd'],
  'Medical': ['#dddddd', '#dddddd'],
  'Misc': ['#fdeded', '#eb605e'], // red
  'Transportation': ['#dddddd', '#dddddd'],
  'Fitness': ['#dddddd', '#dddddd'],
  'Misc.': ['#bbbbbb', '#555555']
};